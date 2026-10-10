// Unit tests import pure logic from modules that transitively import db/pool.js.
// Force the classic 'pg' driver so importing them does NOT spin up an embedded
// PGlite instance (or create a data directory) just to call pure functions:
// with DB_DRIVER=pg and no query ever issued, the pg Pool is constructed lazily
// and never connects. Imported first in every test file; ESM evaluates this
// dependency-free module before the modules that read process.env.DB_DRIVER.
process.env.DB_DRIVER = 'pg';
