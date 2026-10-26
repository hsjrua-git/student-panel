import pool from '../db/pool.js';

// Resets the database to a "fresh institution" state:
//   KEEPS  roles + role_permissions (the seeded system roles) and every user
//          holding the Administrator role, so you can still sign in. Migrations
//          (schema_migrations) are untouched — the schema stays in place. The
//          stored secrets (the `secrets` table), the cafe catalog (products,
//          suppliers) and the accounting chart (accounts, fiscal periods,
//          mappings) stay too.
//   WIPES  all students, groups and memberships, the evaluations (session
//          cells), parameters and custom-field definitions, the whole
//          schedule (intervals, teachers, assignments, sessions, periods,
//          tasks, task templates, alerts), the audit log, saved views,
//          personal preferences, login sessions, and every non-admin account.
//          (Cafe sales/balances rows that reference the wiped students go
//          with them — TRUNCATE CASCADE, as before.)
//
// Guarded: `npm run reset-data -- confirm` actually wipes. Without "confirm"
// it prints the current rows and what it would do, then exits (a dry run).

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function counts(db) {
  const { rows } = await db.query(`SELECT
    (SELECT count(*)::int FROM students)                  AS students,
    (SELECT count(*)::int FROM evaluations)               AS evaluations,
    (SELECT count(*)::int FROM parameters)                AS parameters,
    (SELECT count(*)::int FROM student_groups)            AS groups,
    (SELECT count(*)::int FROM student_field_definitions) AS field_defs,
    (SELECT count(*)::int FROM teachers)                  AS teachers,
    (SELECT count(*)::int FROM intervals)                 AS intervals,
    (SELECT count(*)::int FROM assignments)               AS assignments,
    (SELECT count(*)::int FROM sessions)                  AS schedule_sessions,
    (SELECT count(*)::int FROM periods)                   AS periods,
    (SELECT count(*)::int FROM tasks)                     AS tasks,
    (SELECT count(*)::int FROM alerts)                    AS alerts,
    (SELECT count(*)::int FROM audit_log)                 AS audit,
    (SELECT count(*)::int FROM saved_views)               AS saved_views,
    (SELECT count(*)::int FROM user_preferences)          AS preferences,
    (SELECT count(*)::int FROM user_sessions)             AS login_sessions,
    (SELECT count(*)::int FROM users)                     AS users`);
  return rows[0];
}

async function reset() {
  // Safety net: refuse if it would leave no active admin to sign in with.
  const keep = await pool.query(
    `SELECT count(*)::int AS n FROM users
     WHERE role_id IN (SELECT id FROM roles WHERE lower(name) = 'administrator')
       AND is_active`
  );
  if (keep.rows[0].n === 0) {
    fail('Refusing to reset: no active Administrator user would remain to sign in.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Content + structure: the evaluation cells, the parameters, the whole
    // schedule (assignments → sessions → periods, plus tasks, templates and
    // alerts) and the students/groups. CASCADE is a safety net for any FK
    // children (including the cafe rows that reference wiped students).
    await client.query(`TRUNCATE
      evaluations,
      tasks, task_templates, alerts,
      sessions, periods, assignments, teachers, intervals,
      parameters, student_field_definitions,
      student_group_members, student_groups, students
      RESTART IDENTITY CASCADE`);

    // History + personal data. Removing the log first means no rows reference
    // the users we are about to delete.
    await client.query('TRUNCATE audit_log RESTART IDENTITY');
    await client.query('DELETE FROM saved_views');
    await client.query('DELETE FROM user_preferences');
    // The period_anchor_date key died with migration 029 (periods are stored
    // rows now); deleting a row that is no longer there is harmless.
    await client.query(`DELETE FROM settings WHERE key = 'period_anchor_date'`);

    // Every account except the Administrator(s).
    const removed = await client.query(
      `DELETE FROM users
       WHERE role_id NOT IN (SELECT id FROM roles WHERE lower(name) = 'administrator')`
    );

    // Log everyone out (server-side session store).
    await client.query('TRUNCATE user_sessions');

    await client.query('COMMIT');
    console.log(`Removed ${removed.rowCount} non-admin user(s).`);
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
  console.log('Done — fresh-institution state: system roles + your admin only.');
} else if (command === undefined) {
  console.log(
    '\nDry run — nothing was changed.\n' +
      'This WIPES students, groups and memberships, evaluations, parameters, the\n' +
      'whole schedule (intervals, teachers, assignments, sessions, periods, tasks,\n' +
      'task templates, alerts), field definitions, the audit log, saved views,\n' +
      'preferences, and login sessions, and removes every non-admin account.\n' +
      'Roles, permissions and your Administrator account stay — and so do stored\n' +
      'secrets, the cafe catalog and the accounting chart.\n\n' +
      'To actually do it:  npm run reset-data -- confirm'
  );
} else {
  fail(
    'Usage:\n  npm run reset-data            dry run (shows what would be wiped)\n  npm run reset-data -- confirm wipes to a fresh-institution state'
  );
}

await pool.end();
