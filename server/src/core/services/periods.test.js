// Service-layer test for the period calendar and its anchor date — real service
// functions against a fresh in-memory PGlite.
//
//   node --test src/core/services/periods.test.js
//
// Each test gets its own in-memory database.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createPglitePool } from '../../db/pglite.js';
import { initDb } from '../db.js';
import { getPeriodAnchor, setPeriodAnchor, listPeriods } from './periods.js';
import { createParameter } from './parameters.js';

const migrationsDir = path.join(import.meta.dirname, '..', '..', 'db', 'migrations');
const SATURDAY = '2024-01-06'; // a real Saturday
const SUNDAY = '2024-01-07';

async function freshDb() {
  const pool = createPglitePool(); // in-memory
  await pool.ready();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const files = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  initDb(pool);
  return pool;
}

async function expectCode(code, fn) {
  await assert.rejects(fn, (err) => {
    assert.equal(err.name, 'ServiceError', `expected a ServiceError, got ${err}`);
    assert.equal(err.code, code, `expected code ${code}, got ${err.code}`);
    return true;
  });
}

async function addStudent(pool, code, fullName) {
  const result = await pool.query(
    `INSERT INTO students (student_code, full_name)
     VALUES ($1, $2) RETURNING id`,
    [code, fullName],
  );
  return result.rows[0].id;
}

test('anchor: unset by default, validated, and settable', async () => {
  const pool = await freshDb();
  try {
    assert.deepEqual(await getPeriodAnchor(), { anchorDate: null });

    await expectCode('VALIDATION', () => setPeriodAnchor('nonsense'));
    await expectCode('VALIDATION', () => setPeriodAnchor('2024-02-30')); // not a real date
    await expectCode('VALIDATION', () => setPeriodAnchor(SUNDAY)); // not a Saturday

    const set = await setPeriodAnchor(SATURDAY);
    assert.deepEqual(set, { anchorDate: SATURDAY });
    assert.deepEqual(await getPeriodAnchor(), { anchorDate: SATURDAY });

    // Re-setting to a different Saturday before any scores exist is fine.
    const moved = await setPeriodAnchor('2024-01-13');
    assert.deepEqual(moved, { anchorDate: '2024-01-13' });
  } finally {
    await pool.end();
  }
});

test('anchor cannot change after scores exist, but re-setting the same value is a no-op', async () => {
  const pool = await freshDb();
  try {
    await setPeriodAnchor(SATURDAY);

    const p = await createParameter({ name: 'Focus', startPeriod: 1 });
    const sid = await addStudent(pool, 'ABCDEFGH', 'Alan Turing');
    await pool.query(
      `INSERT INTO evaluations (student_id, parameter_id, period_number, value, locks_at)
       VALUES ($1, $2, 1, 5, now() + interval '7 days')`,
      [sid, p.id],
    );

    // Changing it now is refused.
    await expectCode('CONFLICT', () => setPeriodAnchor('2024-01-13'));
    // But re-affirming the current value still succeeds.
    assert.deepEqual(await setPeriodAnchor(SATURDAY), { anchorDate: SATURDAY });
  } finally {
    await pool.end();
  }
});

test('listPeriods: empty without an anchor, calendar with one', async () => {
  const pool = await freshDb();
  try {
    const empty = await listPeriods();
    assert.equal(empty.anchorDate, null);
    assert.equal(empty.current, null);
    assert.deepEqual(empty.periods, []);
    assert.match(empty.today, /^\d{4}-\d{2}-\d{2}$/);

    await setPeriodAnchor(SATURDAY);
    const p = await createParameter({ name: 'Alpha', startPeriod: 1 });

    const calendar = await listPeriods();
    assert.equal(calendar.anchorDate, SATURDAY);
    assert.ok(Number.isInteger(calendar.current) && calendar.current >= 1);
    assert.equal(calendar.periods.length, calendar.current);

    // Period 1 starts on the anchor and carries the parameter active from it.
    const first = calendar.periods[0];
    assert.equal(first.number, 1);
    assert.equal(first.startDate, SATURDAY);
    assert.equal(first.endDate, '2024-01-12'); // seven-day window, inclusive
    assert.deepEqual(first.parameterIds, [p.id]);
  } finally {
    await pool.end();
  }
});
