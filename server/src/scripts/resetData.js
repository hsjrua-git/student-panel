import pool from '../db/pool.js';
import { recordAudit } from '../lib/audit.js';
import { getOperatorName } from '../lib/settings.js';

// Reset the database to a "fresh" state so you can start entering real data:
//   KEEPS  the schema (schema_migrations) and your login (the `settings` rows:
//          password hash, initialized flag, operator name, app title). The audit
//          log is also KEPT — this build's trail is append-only, never purged —
//          and the reset itself is recorded in it.
//   WIPES  all students, groups + memberships, parameters + assignments, periods
//          + assignments, evaluations, tasks + assignments, custom field
//          definitions, saved views, and sessions; and clears operator
//          preferences back to defaults.
//
// Guarded: `npm run reset-data -- confirm` actually wipes. Without "confirm" it
// prints the current row counts and what it would do, then exits (a dry run).

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function counts(db) {
  const { rows } = await db.query(`SELECT
    (SELECT count(*)::int FROM students)                  AS students,
    (SELECT count(*)::int FROM student_groups)            AS groups,
    (SELECT count(*)::int FROM student_group_members)     AS memberships,
    (SELECT count(*)::int FROM parameters)                AS parameters,
    (SELECT count(*)::int FROM periods)                   AS periods,
    (SELECT count(*)::int FROM evaluations)               AS evaluations,
    (SELECT count(*)::int FROM tasks)                     AS tasks,
    (SELECT count(*)::int FROM student_field_definitions) AS field_defs,
    (SELECT count(*)::int FROM saved_views)               AS saved_views,
    (SELECT count(*)::int FROM user_sessions)             AS sessions,
    (SELECT count(*)::int FROM audit_log)                 AS audit_kept`);
  return rows[0];
}

async function reset() {
  const before = await counts(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // All operational content. CASCADE pulls in the assignment / membership
    // tables that reference these, and RESTART IDENTITY resets the (uuid-keyed)
    // tables' sequences harmlessly.
    await client.query(`TRUNCATE
      evaluations,
      tasks, task_assignments,
      parameter_assignments, period_assignments,
      student_group_members, student_groups,
      students, parameters, periods,
      student_field_definitions
      RESTART IDENTITY CASCADE`);

    await client.query('DELETE FROM saved_views');
    await client.query(
      "UPDATE preferences SET settings = '{}'::jsonb, updated_at = now() WHERE id = 1"
    );

    // Log every device out (server-side session store). Login settings are kept.
    await client.query('TRUNCATE user_sessions');

    // The audit log is append-only: keep it and record that a reset happened.
    await recordAudit(client, {
      actor: await getOperatorName(),
      action: 'data.reset',
      entityType: 'database',
      details: { before },
    });

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const command = process.argv[2];
console.log('Current rows:', await counts(pool));

if (command === 'confirm') {
  await reset();
  console.log('After reset:', await counts(pool));
  console.log('Done — fresh state. Your login and the audit log were kept.');
} else if (command === undefined) {
  console.log(
    '\nDry run — nothing was changed.\n' +
      'This WIPES students, groups, parameters, periods, evaluations, tasks, field\n' +
      'definitions, saved views and sessions, and clears preferences. Your login\n' +
      '(password) and the audit log are KEPT.\n\n' +
      'To actually do it:  npm run reset-data -- confirm'
  );
} else {
  fail(
    'Usage:\n' +
      '  npm run reset-data            dry run (shows what would be wiped)\n' +
      '  npm run reset-data -- confirm wipes to a fresh state'
  );
}

await pool.end();
