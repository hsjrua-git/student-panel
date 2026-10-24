// Service-layer test for reading and bulk-saving evaluations (periodic scores)
// — real service functions against a fresh in-memory PGlite.
//
//   node --test src/core/services/evaluations.test.js
//
// Each test gets its own in-memory database. The single-admin collapse means
// the dry-run preview is never redacted and there is no "no override" refusal,
// but the lock guardrail is kept: changing a locked score needs a written
// reason (audited).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createPglitePool } from '../../db/pglite.js';
import { initDb } from '../db.js';
import { resetLocalUser } from '../context.js';
import { getEvaluations, saveEvaluationsBulk } from './evaluations.js';
import { setPeriodAnchor } from './periods.js';
import { createParameter } from './parameters.js';

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
  resetLocalUser(); // audit tolerates a null user id; no seeded user needed
  return pool;
}

async function expectCode(code, fn) {
  await assert.rejects(fn, (err) => {
    assert.equal(err.name, 'ServiceError', `expected a ServiceError, got ${err}`);
    assert.equal(err.code, code, `expected code ${code}, got ${err.code}`);
    return true;
  });
}

// student_code must match ^[2-9A-HJ-NP-Z]{8}$.
async function addStudent(pool, code, fullName) {
  const result = await pool.query(
    `INSERT INTO students (student_code, full_name)
     VALUES ($1, $2) RETURNING id`,
    [code, fullName],
  );
  return result.rows[0].id;
}

test('getEvaluations: needs a filter, validates ids, reads stored rows', async () => {
  const pool = await freshDb();
  try {
    await setPeriodAnchor(SATURDAY);
    const p = await createParameter({ name: 'Focus', minValue: 0, maxValue: 10, startPeriod: 1 });
    const sid = await addStudent(pool, 'ABCDEFGH', 'Ada Lovelace');

    // At least one filter is required.
    await expectCode('VALIDATION', () => getEvaluations({}));
    // Bad ids / period.
    await expectCode('VALIDATION', () => getEvaluations({ studentId: 'nope' }));
    await expectCode('VALIDATION', () => getEvaluations({ parameterId: 'nope' }));
    await expectCode('VALIDATION', () => getEvaluations({ periodNumber: 'x' }));

    // Save a score, then read it back.
    await saveEvaluationsBulk({ periodNumber: 1, entries: [{ studentId: sid, parameterId: p.id, value: 7 }] });

    const { evaluations } = await getEvaluations({ studentId: sid });
    assert.equal(evaluations.length, 1);
    assert.equal(evaluations[0].value, 7);
    assert.equal(evaluations[0].parameterId, p.id);
    assert.equal(evaluations[0].isLocked, false); // fresh save locks in the future

    // A cleared cell is hidden unless includeCleared is set.
    await saveEvaluationsBulk({ periodNumber: 1, entries: [{ studentId: sid, parameterId: p.id, value: null }] });
    assert.equal((await getEvaluations({ studentId: sid })).evaluations.length, 0);
    assert.equal(
      (await getEvaluations({ studentId: sid, includeCleared: true })).evaluations.length,
      1,
    );
  } finally {
    await pool.end();
  }
});

test('saveEvaluationsBulk: input + precondition guards', async () => {
  const pool = await freshDb();
  try {
    const p = await createParameter({ name: 'Focus', minValue: 0, maxValue: 10, startPeriod: 1 });
    const sid = await addStudent(pool, 'ABCDEFGH', 'Ada Lovelace');
    const entry = { studentId: sid, parameterId: p.id, value: 5 };

    // Shape/flag validation.
    await expectCode('VALIDATION', () => saveEvaluationsBulk({ periodNumber: 1, entries: [entry], dryRun: 'yes' }));
    await expectCode('VALIDATION', () => saveEvaluationsBulk({ periodNumber: 1, entries: [entry], source: 'nope' }));
    await expectCode('VALIDATION', () => saveEvaluationsBulk({ periodNumber: 0, entries: [entry] }));
    await expectCode('VALIDATION', () => saveEvaluationsBulk({ periodNumber: 1, entries: [] }));

    // No anchor yet → CONFLICT.
    await expectCode('CONFLICT', () => saveEvaluationsBulk({ periodNumber: 1, entries: [entry] }));

    // With an anchor, a valid-but-not-yet-started period is refused.
    await setPeriodAnchor(SATURDAY);
    await expectCode('VALIDATION', () => saveEvaluationsBulk({ periodNumber: 5000, entries: [entry] }));
  } finally {
    await pool.end();
  }
});

test('dryRun previews without writing and is never redacted', async () => {
  const pool = await freshDb();
  try {
    await setPeriodAnchor(SATURDAY);
    const p = await createParameter({ name: 'Focus', minValue: 0, maxValue: 10, startPeriod: 1 });
    const sid = await addStudent(pool, 'ABCDEFGH', 'Ada Lovelace');

    const preview = await saveEvaluationsBulk({
      periodNumber: 1,
      dryRun: true,
      entries: [{ studentId: sid, parameterId: p.id, value: 8 }],
    });
    assert.equal(preview.dryRun, true);
    assert.equal(preview.periodNumber, 1);
    assert.equal(preview.redacted, undefined); // single admin: full visibility
    assert.deepEqual(preview.problems, []);
    assert.ok(Array.isArray(preview.cells));
    assert.ok(preview.counts && typeof preview.counts === 'object');

    // The preview wrote nothing.
    assert.equal((await getEvaluations({ studentId: sid })).evaluations.length, 0);
  } finally {
    await pool.end();
  }
});

test('invalid entries are rejected (VALIDATION) and nothing is saved', async () => {
  const pool = await freshDb();
  try {
    await setPeriodAnchor(SATURDAY);
    const p = await createParameter({ name: 'Focus', minValue: 0, maxValue: 10, startPeriod: 1 });
    const sid = await addStudent(pool, 'ABCDEFGH', 'Ada Lovelace');

    // Out-of-range value → a problem, surfaced on details.problems.
    await assert.rejects(
      () => saveEvaluationsBulk({ periodNumber: 1, entries: [{ studentId: sid, parameterId: p.id, value: 99 }] }),
      (err) => {
        assert.equal(err.code, 'VALIDATION');
        assert.ok(Array.isArray(err.details?.problems) && err.details.problems.length === 1);
        return true;
      },
    );
    assert.equal((await getEvaluations({ studentId: sid })).evaluations.length, 0);

    // Unknown student is also a problem.
    const ghost = '00000000-0000-4000-8000-000000000000';
    await expectCode('VALIDATION', () =>
      saveEvaluationsBulk({ periodNumber: 1, entries: [{ studentId: ghost, parameterId: p.id, value: 3 }] }),
    );
  } finally {
    await pool.end();
  }
});

test('a real save records one audit row; an identical re-save is a no-op', async () => {
  const pool = await freshDb();
  try {
    await setPeriodAnchor(SATURDAY);
    const p = await createParameter({ name: 'Focus', minValue: 0, maxValue: 10, startPeriod: 1 });
    const sid = await addStudent(pool, 'ABCDEFGH', 'Ada Lovelace');

    const saved = await saveEvaluationsBulk({
      periodNumber: 1,
      entries: [{ studentId: sid, parameterId: p.id, value: 6, comment: 'good' }],
    });
    assert.deepEqual(saved, { periodNumber: 1, changed: 1 });

    const audit = await pool.query(
      `SELECT action, entity_type AS "entityType", entity_id AS "entityId", details
       FROM audit_log ORDER BY id`,
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].action, 'scores.save');
    assert.equal(audit.rows[0].entityId, '1');
    assert.equal(audit.rows[0].details.count, 1);

    // Writing the same value + note again changes nothing.
    const again = await saveEvaluationsBulk({
      periodNumber: 1,
      entries: [{ studentId: sid, parameterId: p.id, value: 6, comment: 'good' }],
    });
    assert.deepEqual(again, { periodNumber: 1, changed: 0 });
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n, 1);
  } finally {
    await pool.end();
  }
});

test('a locked score needs a written override reason (audited)', async () => {
  const pool = await freshDb();
  try {
    await setPeriodAnchor(SATURDAY);
    const p = await createParameter({ name: 'Focus', minValue: 0, maxValue: 10, startPeriod: 1 });
    const sid = await addStudent(pool, 'ABCDEFGH', 'Ada Lovelace');

    // Hand-insert an already-locked score (locks_at in the past).
    await pool.query(
      `INSERT INTO evaluations (student_id, parameter_id, period_number, value, locks_at)
       VALUES ($1, $2, 1, 4, now() - interval '1 day')`,
      [sid, p.id],
    );

    // Changing it with no reason → OVERRIDE_REASON_REQUIRED, nothing saved.
    await assert.rejects(
      () => saveEvaluationsBulk({ periodNumber: 1, entries: [{ studentId: sid, parameterId: p.id, value: 9 }] }),
      (err) => {
        assert.equal(err.code, 'VALIDATION');
        assert.equal(err.details?.code, 'OVERRIDE_REASON_REQUIRED');
        assert.ok(err.details.problems.length === 1);
        return true;
      },
    );
    assert.equal((await getEvaluations({ studentId: sid })).evaluations[0].value, 4);

    // With a reason it goes through and the reason lands in the audit trail.
    const saved = await saveEvaluationsBulk({
      periodNumber: 1,
      entries: [{ studentId: sid, parameterId: p.id, value: 9 }],
      overrideReason: 'Correcting a data-entry error after review.',
    });
    assert.deepEqual(saved, { periodNumber: 1, changed: 1 });
    assert.equal((await getEvaluations({ studentId: sid })).evaluations[0].value, 9);

    const audit = await pool.query('SELECT details FROM audit_log ORDER BY id');
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].details.overrideReason, 'Correcting a data-entry error after review.');
    assert.equal(audit.rows[0].details.changes[0].override, true);
  } finally {
    await pool.end();
  }
});
