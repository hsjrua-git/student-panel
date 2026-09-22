import pool from '../db/pool.js';
import { parametersUsedInPeriod } from '../lib/parameterUse.js';
import { periodForDate, todayIso } from '../lib/periods.js';
import { generateStudentCode } from '../lib/studentCode.js';

const PREFIX = 'Sample Student';
const COUNT = 30;

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function removeSample() {
  const found = await pool.query(
    'SELECT id FROM students WHERE full_name LIKE $1',
    [`${PREFIX}%`]
  );
  const ids = found.rows.map((row) => row.id);
  await pool.query('DELETE FROM evaluations WHERE student_id = ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM students WHERE id = ANY($1::uuid[])', [ids]);
  console.log(`Removed ${ids.length} sample students and their scores.`);
}

async function addSample() {
  const anchorResult = await pool.query(
    'SELECT value FROM settings WHERE key = $1',
    ['period_anchor_date']
  );
  const anchor = anchorResult.rows[0]?.value;
  if (!anchor) fail('Set the period start date first (Settings page).');

  const current = periodForDate(anchor, todayIso());
  if (current === null) fail('Period 1 has not started yet.');

  const existing = await pool.query(
    'SELECT count(*)::int AS count FROM students WHERE full_name LIKE $1',
    [`${PREFIX}%`]
  );
  if (existing.rows[0].count > 0) {
    fail('Sample data already exists. Remove it first: npm run seed-sample -- remove');
  }

  const [changesResult, parametersResult] = await Promise.all([
    pool.query(
      `SELECT parameter_id  AS "parameterId",
              period_number AS "periodNumber",
              scope,
              action
       FROM parameter_changes`
    ),
    pool.query(
      `SELECT id,
              min_value::float8 AS "minValue",
              max_value::float8 AS "maxValue"
       FROM parameters`
    ),
  ]);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const studentIds = [];
    for (let i = 1; i <= COUNT; i++) {
      const name = `${PREFIX} ${String(i).padStart(2, '0')}`;
      let id = null;
      while (id === null) {
        const inserted = await client.query(
          `INSERT INTO students (student_code, full_name)
           VALUES ($1, $2)
           ON CONFLICT (student_code) DO NOTHING
           RETURNING id`,
          [generateStudentCode(), name]
        );
        id = inserted.rows[0]?.id ?? null;
      }
      studentIds.push(id);
    }

    const abilities = studentIds.map(() => 3 + Math.random() * 5);
    const rows = { students: [], parameters: [], periods: [], values: [] };

    for (let period = 1; period <= current; period++) {
      const usedIds = new Set(parametersUsedInPeriod(changesResult.rows, period));
      const missingChance = period === current ? 0.35 : 0.12;

      for (const parameter of parametersResult.rows) {
        if (!usedIds.has(parameter.id)) continue;
        const min = parameter.minValue ?? 0;
        const max = parameter.maxValue ?? 10;

        studentIds.forEach((studentId, index) => {
          if (Math.random() < missingChance) return;
          const noise = (Math.random() + Math.random() - 1) * 1.5;
          const raw = abilities[index] + period / current + noise;
          const value = Math.min(max, Math.max(min, Math.round(raw * 2) / 2));
          rows.students.push(studentId);
          rows.parameters.push(parameter.id);
          rows.periods.push(period);
          rows.values.push(value);
        });
      }
    }

    if (rows.values.length > 0) {
      await client.query(
        `INSERT INTO evaluations
           (student_id, parameter_id, period_number, value, locks_at)
         SELECT s, p, n, v, now() + interval '7 days'
         FROM unnest($1::uuid[], $2::uuid[], $3::int[], $4::numeric[])
              AS t(s, p, n, v)`,
        [rows.students, rows.parameters, rows.periods, rows.values]
      );
    }

    await client.query('COMMIT');
    console.log(
      `Added ${COUNT} sample students and ${rows.values.length} scores across ${current} periods.`
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const command = process.argv[2];
if (command === 'remove') {
  await removeSample();
} else if (command === undefined) {
  await addSample();
} else {
  fail(
    'Usage:\n  npm run seed-sample            adds sample data\n  npm run seed-sample -- remove  removes it'
  );
}
await pool.end();