import pool from '../db/pool.js';

// Thin key/value access over the `settings` table (migration 001). Values are
// stored as text; callers that want JSON encode/decode themselves. Secret-like
// values (the password hash) live here too — never return them to the client.

// Well-known setting keys.
export const KEYS = {
  passwordHash: 'auth.password_hash',
  initialized: 'auth.initialized',
  operatorName: 'operator.name',
  appTitle: 'app.title',
};

// Public (non-secret) settings the client is allowed to read/write on the
// Settings page. The password hash is deliberately NOT here.
export const PUBLIC_SETTINGS = new Set([KEYS.operatorName, KEYS.appTitle]);

export async function getSetting(key, db = pool) {
  const result = await db.query('SELECT value FROM settings WHERE key = $1', [key]);
  return result.rows[0]?.value ?? null;
}

// Cache the operator's display name so the per-request audit actor lookup does
// not hit the database on every mutation. Invalidated whenever settings change.
let operatorNameCache;
export async function getOperatorName(db = pool) {
  if (operatorNameCache === undefined) {
    operatorNameCache = (await getSetting(KEYS.operatorName, db)) || 'operator';
  }
  return operatorNameCache;
}

export async function setSetting(key, value, db = pool) {
  await db.query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value]
  );
  if (key === KEYS.operatorName) operatorNameCache = value || 'operator';
}

export async function isInitialized(db = pool) {
  return (await getSetting(KEYS.initialized, db)) === 'true';
}

export async function getPublicSettings(db = pool) {
  const result = await db.query(
    `SELECT key, value FROM settings WHERE key = ANY($1)`,
    [[...PUBLIC_SETTINGS]]
  );
  const out = {};
  for (const row of result.rows) out[row.key] = row.value;
  return out;
}
