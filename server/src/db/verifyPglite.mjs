// Proof that the re-baselined single-user migrations apply cleanly on PGlite
// (Postgres-in-WASM) and that the runtime behaviour the app relies on works:
// gen_random_uuid()/now() defaults, CHECK constraints, partial unique indexes,
// the parameter/period trees, the XOR "assign to student OR group" rule, and the
// per-group evaluations uniqueness (student score vs the group's own score).
//
// Runs against a FRESH IN-MEMORY database every time (no dataDir), so it never
// touches real data and can be re-run freely.
//
//   npm run verify-pglite      (from server/)
//
// Exit code 0 = everything passed; 1 = something failed (details above).

import fs from 'node:fs/promises';
import path from 'node:path';
import { createPglitePool } from './pglite.js';

const migrationsDir = path.join(import.meta.dirname, 'migrations');

const pass = (msg) => console.log(`  ✓ ${msg}`);
let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  ✗ ${msg}`);
};

async function expectReject(pool, label, sql, params) {
  try {
    await pool.query(sql, params);
    fail(`${label} — expected a constraint error, but the statement succeeded`);
  } catch {
    pass(`${label} — correctly rejected`);
  }
}

async function runMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const files = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  console.log(`Applying ${files.length} migration(s) on PGlite:`);
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      pass(`applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      fail(`failed on ${file}: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }
  }
}

const one = (result) => result.rows[0];

async function runSanityChecks(pool) {
  console.log('\nRuntime sanity checks:');

  // gen_random_uuid() + now() defaults; mandatory birthdate + gender accepted.
  const student = one(
    await pool.query(
      `INSERT INTO students (student_code, full_name, birthdate, gender)
       VALUES ('23456789', 'Test Student', '2010-05-01', 'other')
       RETURNING id, created_at`
    )
  );
  if (/^[0-9a-f-]{36}$/i.test(student.id)) pass(`gen_random_uuid() produced a uuid`);
  else fail(`gen_random_uuid() returned an unexpected id: ${student.id}`);
  if (student.created_at) pass('now() default populated created_at');
  else fail('created_at was not defaulted');

  await expectReject(
    pool,
    'student_code_format CHECK',
    `INSERT INTO students (student_code, full_name, birthdate, gender)
     VALUES ('00000000', 'Bad Code', '2010-01-01', 'other')`
  );
  await expectReject(
    pool,
    'students.birthdate NOT NULL',
    `INSERT INTO students (student_code, full_name, gender)
     VALUES ('34567892', 'No DOB', 'other')`
  );

  // preferences singleton (id must be 1; only one row).
  await expectReject(
    pool,
    'preferences single-row CHECK',
    `INSERT INTO preferences (id) VALUES (2)`
  );

  // Parameter tree + norm ordering.
  const root = one(
    await pool.query(
      `INSERT INTO parameters (name, min_value, max_value, norm_min, norm_max)
       VALUES ('Fitness', 0, 100, 40, 60) RETURNING id`
    )
  );
  await pool.query(`INSERT INTO parameters (parent_id, name) VALUES ($1, 'Speed')`, [root.id]);
  await expectReject(
    pool,
    'parameter_norm_order CHECK',
    `INSERT INTO parameters (name, norm_min, norm_max) VALUES ('Bad', 90, 10)`
  );
  await expectReject(
    pool,
    'parameters sibling name unique (root)',
    `INSERT INTO parameters (name) VALUES ('fitness')`
  );

  // Periods + date ordering.
  const period = one(
    await pool.query(
      `INSERT INTO periods (name, start_date, end_date)
       VALUES ('Term 1', '2026-01-01', '2026-03-31') RETURNING id`
    )
  );
  await expectReject(
    pool,
    'period_date_order CHECK',
    `INSERT INTO periods (name, start_date, end_date)
     VALUES ('Backwards', '2026-04-01', '2026-01-01')`
  );

  // Group tree + sibling-name uniqueness.
  const group = one(
    await pool.query(`INSERT INTO student_groups (name) VALUES ('Group A') RETURNING id`)
  );
  await expectReject(
    pool,
    'student_groups top-level name unique',
    `INSERT INTO student_groups (name) VALUES ('group a')`
  );

  // XOR "assign to student OR group" on parameter_assignments.
  await pool.query(
    `INSERT INTO parameter_assignments (parameter_id, group_id) VALUES ($1, $2)`,
    [root.id, group.id]
  );
  await expectReject(
    pool,
    'parameter_assignment_one_target (both set)',
    `INSERT INTO parameter_assignments (parameter_id, group_id, student_id)
     VALUES ($1, $2, $3)`,
    [root.id, group.id, student.id]
  );
  await expectReject(
    pool,
    'parameter_assignment_one_target (neither set)',
    `INSERT INTO parameter_assignments (parameter_id) VALUES ($1)`,
    [root.id]
  );

  // A leaf parameter to score against.
  const leaf = one(
    await pool.query(
      `INSERT INTO parameters (parent_id, name, min_value, max_value)
       VALUES ($1, 'Sprint', 0, 10) RETURNING id`,
      [root.id]
    )
  );

  // Per-group evaluations: a student's score inside a group, and the group's own
  // score. Both must be unique within (group, [student], parameter, period).
  await pool.query(
    `INSERT INTO evaluations (group_id, student_id, parameter_id, period_id, value)
     VALUES ($1, $2, $3, $4, 7.5)`,
    [group.id, student.id, leaf.id, period.id]
  );
  await expectReject(
    pool,
    'evaluations_student_unique',
    `INSERT INTO evaluations (group_id, student_id, parameter_id, period_id, value)
     VALUES ($1, $2, $3, $4, 8)`,
    [group.id, student.id, leaf.id, period.id]
  );
  await pool.query(
    `INSERT INTO evaluations (group_id, parameter_id, period_id, value)
     VALUES ($1, $2, $3, 6)`,
    [group.id, leaf.id, period.id]
  );
  await expectReject(
    pool,
    'evaluations_group_unique',
    `INSERT INTO evaluations (group_id, parameter_id, period_id, value)
     VALUES ($1, $2, $3, 9)`,
    [group.id, leaf.id, period.id]
  );

  const evalCount = Number(
    one(await pool.query(`SELECT COUNT(*)::int AS count FROM evaluations`)).count
  );
  if (evalCount === 2) pass('two evaluations stored (one student, one group-direct)');
  else fail(`expected 2 evaluations, found ${evalCount}`);
}

async function main() {
  const pool = createPglitePool();
  await pool.ready();
  try {
    await runMigrations(pool);
    await runSanityChecks(pool);
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`
    );
    console.log(`\nTables created (${tables.rows.length}):`);
    console.log('  ' + tables.rows.map((r) => r.table_name).join(', '));
  } catch {
    // Failure already reported; fall through to the summary.
  } finally {
    await pool.end();
  }

  console.log('');
  if (failures === 0) {
    console.log('RESULT: PASS — migrations applied and every sanity check passed on PGlite.');
    process.exitCode = 0;
  } else {
    console.log(`RESULT: FAIL — ${failures} check(s) failed. See the lines above.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Verification crashed:', err);
  process.exitCode = 1;
});
