// Service-layer test for parameters and their period-scoped changes — real
// service functions against a fresh in-memory PGlite.
//
//   node --test src/core/services/parameters.test.js
//
// Each test gets its own in-memory database.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createPglitePool } from '../../db/pglite.js';
import { initDb } from '../db.js';
import {
  listParameters,
  createParameter,
  updateParameter,
  listParameterChanges,
  parameterChangeImpact,
  upsertParameterChange,
  deleteParameterChange,
  parametersForPeriod,
} from './parameters.js';

const migrationsDir = path.join(import.meta.dirname, '..', '..', 'db', 'migrations');

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

// Insert a student directly (student_code must match ^[2-9A-HJ-NP-Z]{8}$).
async function addStudent(pool, code, fullName) {
  const result = await pool.query(
    `INSERT INTO students (student_code, full_name)
     VALUES ($1, $2) RETURNING id`,
    [code, fullName],
  );
  return result.rows[0].id;
}

async function addEvaluation(pool, studentId, parameterId, periodNumber, value) {
  // evaluations.locks_at is NOT NULL (migration 007) with no default; a real
  // save computes it, but for these read-side tests any future instant works.
  await pool.query(
    `INSERT INTO evaluations (student_id, parameter_id, period_number, value, locks_at)
     VALUES ($1, $2, $3, $4, now() + interval '7 days')`,
    [studentId, parameterId, periodNumber, value],
  );
}

test('create seeds an add-change at startPeriod; list is ordered; guards', async () => {
  const pool = await freshDb();
  try {
    const p1 = await createParameter({
      name: '  Neat  ness ',
      unit: 'pts',
      minValue: 0,
      maxValue: 10,
      startPeriod: 3,
    });
    assert.match(p1.id, /^[0-9a-f-]{36}$/i);
    assert.equal(p1.name, 'Neat ness'); // whitespace normalised
    assert.equal(p1.unit, 'pts');
    assert.equal(p1.minValue, 0);
    assert.equal(p1.maxValue, 10);
    assert.equal(p1.sortOrder, 1);

    // A 'from_here_on'/'add' change was seeded at startPeriod.
    const { changes } = await listParameterChanges();
    assert.equal(changes.length, 1);
    assert.deepEqual(
      {
        parameterId: changes[0].parameterId,
        periodNumber: changes[0].periodNumber,
        scope: changes[0].scope,
        action: changes[0].action,
      },
      { parameterId: p1.id, periodNumber: 3, scope: 'from_here_on', action: 'add' },
    );

    const p2 = await createParameter({ name: 'Attendance', startPeriod: 1 });
    assert.equal(p2.sortOrder, 2);
    assert.equal(p2.unit, null);

    const { parameters } = await listParameters();
    assert.deepEqual(parameters.map((p) => p.name), ['Neat ness', 'Attendance']);

    // Duplicate name (case-insensitive, whitespace-normalised) collides.
    await expectCode('CONFLICT', () => createParameter({ name: 'neat  ness', startPeriod: 1 }));
    await expectCode('CONFLICT', () => createParameter({ name: 'attendance', startPeriod: 1 }));

    // Validation: empty name, min > max, bad startPeriod.
    await expectCode('VALIDATION', () => createParameter({ name: '', startPeriod: 1 }));
    await expectCode('VALIDATION', () =>
      createParameter({ name: 'Bad', minValue: 9, maxValue: 1, startPeriod: 1 }),
    );
    await expectCode('VALIDATION', () => createParameter({ name: 'NoPeriod' }));
    await expectCode('VALIDATION', () =>
      createParameter({ name: 'ZeroPeriod', startPeriod: 0 }),
    );
  } finally {
    await pool.end();
  }
});

test('update: rename/unit/sortOrder; range locked after scores; guards', async () => {
  const pool = await freshDb();
  try {
    const p = await createParameter({
      name: 'Focus',
      minValue: 0,
      maxValue: 5,
      startPeriod: 1,
    });

    const renamed = await updateParameter(p.id, { name: 'Focus level', unit: 'x', sortOrder: 9 });
    assert.equal(renamed.name, 'Focus level');
    assert.equal(renamed.unit, 'x');
    assert.equal(renamed.sortOrder, 9);

    // Setting min/max to the SAME values is allowed even after scores exist
    // (no real range change).
    const sid = await addStudent(pool, 'ABCDEFGH', 'Ada Lovelace');
    await addEvaluation(pool, sid, p.id, 1, 3);
    const unchanged = await updateParameter(p.id, { minValue: 0, maxValue: 5 });
    assert.equal(unchanged.minValue, 0);

    // Actually changing the range after a score exists is refused.
    await expectCode('CONFLICT', () => updateParameter(p.id, { maxValue: 8 }));

    // Guards.
    await expectCode('VALIDATION', () => updateParameter(p.id, {}));
    await expectCode('VALIDATION', () => updateParameter(p.id, { name: '' }));
    await expectCode('NOT_FOUND', () => updateParameter('not-a-uuid', { name: 'Z' }));
    await expectCode('NOT_FOUND', () =>
      updateParameter('00000000-0000-4000-8000-000000000000', { name: 'Z' }),
    );
  } finally {
    await pool.end();
  }
});

test('parameter changes: upsert replaces, FK 404, delete, guards', async () => {
  const pool = await freshDb();
  try {
    const p = await createParameter({ name: 'Effort', startPeriod: 1 });

    // Upsert a one-off removal at period 2.
    const change = await upsertParameterChange({
      parameterId: p.id,
      periodNumber: 2,
      scope: 'this_period_only',
      action: 'remove',
    });
    assert.equal(change.action, 'remove');
    const firstId = change.id;

    // Upserting the same (parameter, period, scope) updates in place.
    const updated = await upsertParameterChange({
      parameterId: p.id,
      periodNumber: 2,
      scope: 'this_period_only',
      action: 'add',
    });
    assert.equal(updated.id, firstId); // same row, updated action
    assert.equal(updated.action, 'add');

    // A valid-but-missing parameter id is a FK violation → NOT_FOUND.
    await expectCode('NOT_FOUND', () =>
      upsertParameterChange({
        parameterId: '00000000-0000-4000-8000-000000000000',
        periodNumber: 1,
        scope: 'from_here_on',
        action: 'add',
      }),
    );

    // Validation of each field.
    await expectCode('VALIDATION', () =>
      upsertParameterChange({ parameterId: 'nope', periodNumber: 1, scope: 'from_here_on', action: 'add' }),
    );
    await expectCode('VALIDATION', () =>
      upsertParameterChange({ parameterId: p.id, periodNumber: 0, scope: 'from_here_on', action: 'add' }),
    );
    await expectCode('VALIDATION', () =>
      upsertParameterChange({ parameterId: p.id, periodNumber: 1, scope: 'sometimes', action: 'add' }),
    );
    await expectCode('VALIDATION', () =>
      upsertParameterChange({ parameterId: p.id, periodNumber: 1, scope: 'from_here_on', action: 'toggle' }),
    );

    // Delete the change (the seeded add@1 and the one-off@2 exist → 2 rows).
    assert.equal((await listParameterChanges()).changes.length, 2);
    await deleteParameterChange(firstId);
    assert.equal((await listParameterChanges()).changes.length, 1);

    // Deleting again / a missing id / a bad uuid → NOT_FOUND.
    await expectCode('NOT_FOUND', () => deleteParameterChange(firstId));
    await expectCode('NOT_FOUND', () => deleteParameterChange('not-a-uuid'));
  } finally {
    await pool.end();
  }
});

test('impact: counts scores a removal would hide (read-only)', async () => {
  const pool = await freshDb();
  try {
    const p = await createParameter({ name: 'Tidiness', startPeriod: 1 });
    const sid = await addStudent(pool, 'ABCDEFGH', 'Grace Hopper');
    await addEvaluation(pool, sid, p.id, 2, 4); // a score in period 2

    // Removing the parameter from period 2 onward hides that score.
    const impact = await parameterChangeImpact({
      parameterId: p.id,
      periodNumber: '2', // query params arrive as strings
      scope: 'from_here_on',
      action: 'remove',
    });
    assert.deepEqual(impact, { affectedScores: 1, periods: [2] });

    // Re-adding at the same point hides nothing.
    const none = await parameterChangeImpact({
      parameterId: p.id,
      periodNumber: 2,
      scope: 'from_here_on',
      action: 'add',
    });
    assert.deepEqual(none, { affectedScores: 0, periods: [] });

    // The impact preview writes nothing.
    assert.equal((await listParameterChanges()).changes.length, 1);

    await expectCode('VALIDATION', () =>
      parameterChangeImpact({ parameterId: 'nope', periodNumber: 1, scope: 'from_here_on', action: 'add' }),
    );
    await expectCode('VALIDATION', () =>
      parameterChangeImpact({ parameterId: p.id, periodNumber: 'x', scope: 'from_here_on', action: 'add' }),
    );
  } finally {
    await pool.end();
  }
});

test('parametersForPeriod filters to the parameters active in a period', async () => {
  const pool = await freshDb();
  try {
    // Alpha is active from period 1; Beta only from period 3.
    const alpha = await createParameter({ name: 'Alpha', startPeriod: 1 });
    const beta = await createParameter({ name: 'Beta', startPeriod: 3 });

    const p1 = await parametersForPeriod(1);
    assert.equal(p1.periodNumber, 1);
    assert.deepEqual(p1.parameters.map((p) => p.name), ['Alpha']);

    const p3 = await parametersForPeriod(3);
    assert.deepEqual(p3.parameters.map((p) => p.name), ['Alpha', 'Beta']);
    assert.ok(p3.parameters.some((p) => p.id === beta.id));
    assert.ok(p3.parameters.some((p) => p.id === alpha.id));

    await expectCode('VALIDATION', () => parametersForPeriod('nope'));
    await expectCode('VALIDATION', () => parametersForPeriod(0));
  } finally {
    await pool.end();
  }
});

