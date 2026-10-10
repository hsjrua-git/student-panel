import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPglitePool } from './pglite.js';

// Single-user, on-device build: the database is embedded PGlite (Postgres-in-
// WASM) by default, so there is nothing to install or run alongside the app —
// double-click the launcher and go. A classic PostgreSQL server is still
// supported for anyone who wants it, by setting DB_DRIVER=pg + DATABASE_URL.
//
//   DB_DRIVER=pglite (default) -> embedded, data persisted under data/pgdata
//   DB_DRIVER=pg               -> real PostgreSQL via DATABASE_URL
//
// Everything else in the server imports this `pool` and uses only
// pool.query()/pool.connect()/pool.end(); the PGlite facade reproduces that
// surface (see pglite.js), so route and lib code is identical either way.

const driver = (process.env.DB_DRIVER ?? 'pglite').trim().toLowerCase();

// Where PGlite persists its data. Default: <repo>/data/pgdata (this file is at
// server/src/db/pool.js, so three levels up is the compacted-project root).
function defaultDataDir() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..', 'data', 'pgdata');
}

let pool;
let dataDir = null;

if (driver === 'pg') {
  const { default: pg } = await import('pg');
  // A small, bounded pool with fast, loud timeouts (see the original rationale):
  // cap connections, give up acquiring after 10s, release idle after 30s, and
  // let Postgres cancel any single query that runs longer than 15s.
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
  });
  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
  });
} else {
  dataDir = process.env.PGLITE_DATA
    ? path.resolve(process.env.PGLITE_DATA)
    : defaultDataDir();
  pool = createPglitePool(dataDir);
}

// Await when embedded: PGlite exposes ready(); pg pools connect lazily, so this
// is a no-op there. Callers that must not race the first query (the server on
// boot, migrate, scripts) can `await ready()` first.
export async function ready() {
  if (typeof pool.ready === 'function') await pool.ready();
  return pool;
}

export const dbDriver = driver === 'pg' ? 'pg' : 'pglite';
export const dbDataDir = dataDir;
export default pool;
