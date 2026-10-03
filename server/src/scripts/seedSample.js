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
       FROM parameters
       ORDER BY sort_order, name`
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
      // In-use parameters this period, kept in sort_order (the query orders
      // them). Each student measures a PREFIX of this list, so earlier
      // parameters get broader coverage than later ones — that per-parameter
      // spread is what makes the dashboard's satellites glow at visibly
      // different strengths instead of all looking the same.
      const used = parametersResult.rows.filter((p) => usedIds.has(p.id));
      const k = used.length;
      if (k === 0) continue;

      studentIds.forEach((studentId, index) => {
        // Even coverage ramp across the roster: the first students measure
        // nothing, the last measure every parameter, everyone in between sits
        // on a rung of the ladder. This guarantees the cohort shows the full
        // range of states — hollow (none) → dim partial → bright partial →
        // full — so the glow differences are actually visible rather than a
        // random clump. A little per-(student, period) jitter keeps successive
        // periods from being carbon copies (so trends aren't flat) without
        // collapsing the spread.
        const ramp = COUNT > 1 ? index / (COUNT - 1) : 1;
        const jitter = (((index * 7 + period * 13) % 5) - 2) * 0.04;
        const measuredCount = Math.max(
          0,
          Math.min(k, Math.round(ramp * k + jitter * k))
        );

        for (let j = 0; j < measuredCount; j++) {
          const parameter = used[j];
          const min = parameter.minValue ?? 0;
          const max = parameter.maxValue ?? 10;
          const noise = (Math.random() + Math.random() - 1) * 1.5;
          const raw = abilities[index] + period / current + noise;
          const value = Math.min(max, Math.max(min, Math.round(raw * 2) / 2));
          rows.students.push(studentId);
          rows.parameters.push(parameter.id);
          rows.periods.push(period);
          rows.values.push(value);
        }
      });
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