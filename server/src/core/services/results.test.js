// Service-layer test for the results roll-up and the dashboard trends — real
// service functions against a fresh in-memory PGlite.
//
//   node --test src/core/services/results.test.js
//
// Each test gets its own in-memory database.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createPglitePool } from '../../db/pglite.js';
import { initDb } from '../db.js';
import { resetLocalUser } from '../context.js';
import { getResults } from './results.js';
import { getTrends } from './dashboard.js';
import { setPeriodAnchor } from './periods.js';
import { createParameter } from './parameters.js';
import { saveEvaluationsBulk } from './evaluations.js';
import { createGroup, setGroupMembers } from './groups.js';

const migrationsDir = path.join(import.meta.dirname, '..', '..', 'db', 'migrations');
const SATURDAY = '2024-01-06'; // a real Saturday, safely in the past

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
  resetLocalUser();
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

test('getResults: guards on period, group id, and anchor', async () => {
  const pool = await freshDb();
  try {
    // Bad period number.
    await expectCode('VALIDATION', () => getResults({ periodNumber: 'x' }));
    await expectCode('VALIDATION', () => getResults({ periodNumber: 0 }));
    // Bad group id.
    await expectCode('VALIDATION', () => getResults({ periodNumber: 1, groupId: 'nope' }));
    // No anchor set yet.
    await expectCode('CONFLICT', () => getResults({ periodNumber: 1 }));
    // Anchor set, but the period has not started.
    await setPeriodAnchor(SATURDAY);
    await expectCode('VALIDATION', () => getResults({ periodNumber: 5000 }));
  } finally {
    await pool.end();
  }
});

test('getResults: rolls up one period with dates, values, and total', async () => {
  const pool = await freshDb();
  try {
    await setPeriodAnchor(SATURDAY);
    const p = await createParameter({ name: 'Focus', minValue: 0, maxValue: 10, startPeriod: 1 });
    const ada = await addStudent(pool, 'ABCDEFGH', 'Ada Lovelace');
    const bob = await addStudent(pool, 'JKLMNPQR', 'Bob Turing');

    await saveEvaluationsBulk({
      periodNumber: 1,
      entries: [
        { studentId: ada, parameterId: p.id, value: 8 },
        { studentId: bob, parameterId: p.id, value: 4 },
      ],
    });

    const out = await getResults({ periodNumber: 1 });
    assert.equal(out.periodNumber, 1);
    assert.equal(out.startDate, SATURDAY);
    assert.equal(out.endDate, '2024-01-12');
    assert.equal(out.total, 2);
    assert.equal(out.truncated, false);
    assert.deepEqual(out.parameters.map((x) => x.id), [p.id]);
    assert.equal(out.parameters[0].inUse, true);

    // Students come back alphabetically with their current values.
    assert.deepEqual(out.students.map((s) => s.fullName), ['Ada Lovelace', 'Bob Turing']);
    assert.equal(out.students[0].values[p.id], 8);
    assert.equal(out.students[1].values[p.id], 4);
  } finally {
    await pool.end();
  }
});

test('getResults: groupId scopes to the group subtree (and its count)', async () => {
  const pool = await freshDb();
  try {
    await setPeriodAnchor(SATURDAY);
    const p = await createParameter({ name: 'Focus', minValue: 0, maxValue: 10, startPeriod: 1 });
    const ada = await addStudent(pool, 'ABCDEFGH', 'Ada Lovelace');
    const bob = await addStudent(pool, 'JKLMNPQR', 'Bob Turing');
    await saveEvaluationsBulk({
      periodNumber: 1,
      entries: [
        { studentId: ada, parameterId: p.id, value: 8 },
        { studentId: bob, parameterId: p.id, value: 4 },
      ],
    });

    const { group } = await createGroup({ name: 'Class A' });
    await setGroupMembers(group.id, { add: [ada] });

    const out = await getResults({ periodNumber: 1, groupId: group.id });
    assert.equal(out.total, 1);
    assert.deepEqual(out.students.map((s) => s.fullName), ['Ada Lovelace']);
    assert.equal(out.students[0].values[p.id], 8);
  } finally {
    await pool.end();
  }
});

test('getTrends: averages by parameter/period, guards, and scopes by group', async () => {
  const pool = await freshDb();
  try {
    await setPeriodAnchor(SATURDAY);
    const p = await createParameter({ name: 'Focus', minValue: 0, maxValue: 10, startPeriod: 1 });
    const ada = await addStudent(pool, 'ABCDEFGH', 'Ada Lovelace');
    const bob = await addStudent(pool, 'JKLMNPQR', 'Bob Turing');
    await saveEvaluationsBulk({
      periodNumber: 1,
      entries: [
        { studentId: ada, parameterId: p.id, value: 8 },
        { studentId: bob, parameterId: p.id, value: 4 },
      ],
    });

    await expectCode('VALIDATION', () => getTrends({ groupId: 'nope' }));

    const all = await getTrends();
    assert.equal(all.trends.length, 1);
    assert.equal(all.trends[0].parameterId, p.id);
    assert.equal(all.trends[0].periodNumber, 1);
    assert.equal(all.trends[0].average, 6); // (8 + 4) / 2
    assert.equal(all.trends[0].count, 2);

    // Scoped to a group holding only Ada, the average is just her score.
    const { group } = await createGroup({ name: 'Class A' });
    await setGroupMembers(group.id, { add: [ada] });
    const scoped = await getTrends({ groupId: group.id });
    assert.equal(scoped.trends.length, 1);
    assert.equal(scoped.trends[0].average, 8);
    assert.equal(scoped.trends[0].count, 1);
  } finally {
    await pool.end();
  }
});

// PLACEHOLDER_TESTS
