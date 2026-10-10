import pool from '../db/pool.js';
import { generateStudentCode } from '../lib/studentCode.js';

// Seed a small, coherent sample dataset in the per-group model, for trying the
// app out. It builds: a nested parameter tree (only leaves are scored), a nested
// group tree, students placed in the leaf groups, a couple of dated periods
// assigned to the root group, and evaluations for every (group, student, leaf
// parameter, period) plus some group-own direct scores.
//
// Everything it creates is tagged by name ("Sample ...") / full-name prefix, so
// `npm run seed-sample -- remove` can take it all back out again. Values are
// never range-checked by the DB, but the seed keeps them inside each leaf's
// [min, max] so charts and roll-ups look sensible.

const STUDENT_PREFIX = 'Sample Student';

// Nested parameters. Parents carry no stored range (derived from children);
// leaves carry unit + min/max + optional norm range. `key` is a local handle
// used to wire children and to target evaluations at the leaves.
const PARAM_TREE = [
  {
    key: 'academic',
    name: 'Sample: Academic',
    children: [
      { key: 'math', name: 'Mathematics', unit: 'points', min: 0, max: 100, normMin: 60, normMax: 80 },
      { key: 'reading', name: 'Reading', unit: 'points', min: 0, max: 100, normMin: 65, normMax: 85 },
    ],
  },
  {
    key: 'physical',
    name: 'Sample: Physical',
    children: [
      { key: 'endurance', name: 'Endurance', unit: 'reps', min: 0, max: 50, normMin: 20, normMax: 30 },
      { key: 'strength', name: 'Strength', unit: 'reps', min: 0, max: 50, normMin: 25, normMax: 35 },
    ],
  },
  // A top-level leaf (no children) exercises the "root is itself a leaf" case.
  { key: 'attendance', name: 'Sample: Attendance', unit: '%', min: 0, max: 100, normMin: 90, normMax: 100 },
];

// Nested groups. The two classes are leaf groups that actually hold students.
const GROUP_TREE = {
  key: 'school',
  name: 'Sample School',
  children: [
    { key: 'classA', name: 'Sample Class A' },
    { key: 'classB', name: 'Sample Class B' },
  ],
};

const PERIODS = [
  { key: 'term1', name: 'Sample Term 1', start: '2025-09-01', end: '2025-12-19' },
  { key: 'term2', name: 'Sample Term 2', start: '2026-01-12', end: '2026-04-17' },
];

const GENDERS = ['female', 'male', 'non-binary'];
const STUDENT_COUNT = 12;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function clamp(min, max, value) {
  return Math.min(max, Math.max(min, value));
}

// Deterministic-ish spread so students differ and periods trend upward, with a
// little jitter so successive periods are not carbon copies.
function sampleValue(leaf, abilityRatio, periodIndex) {
  const span = leaf.max - leaf.min;
  const trend = periodIndex * 0.06 * span;
  const noise = (Math.random() + Math.random() - 1) * 0.08 * span;
  const raw = leaf.min + abilityRatio * span * 0.8 + span * 0.1 + trend + noise;
  return Math.round(clamp(leaf.min, leaf.max, raw) * 2) / 2;
}

async function collectSampleIds(db) {
  const groupNames = [GROUP_TREE.name, ...GROUP_TREE.children.map((c) => c.name)];
  const paramNames = PARAM_TREE.flatMap((p) => [p.name, ...(p.children ?? []).map((c) => c.name)]);
  const periodNames = PERIODS.map((p) => p.name);

  const [groups, students, params, periods] = await Promise.all([
    db.query('SELECT id FROM student_groups WHERE name = ANY($1)', [groupNames]),
    db.query('SELECT id FROM students WHERE full_name LIKE $1', [`${STUDENT_PREFIX}%`]),
    db.query('SELECT id FROM parameters WHERE name = ANY($1)', [paramNames]),
    db.query('SELECT id FROM periods WHERE name = ANY($1)', [periodNames]),
  ]);

  return {
    groupIds: groups.rows.map((r) => r.id),
    studentIds: students.rows.map((r) => r.id),
    paramIds: params.rows.map((r) => r.id),
    periodIds: periods.rows.map((r) => r.id),
  };
}

async function removeSample() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { groupIds, studentIds, paramIds, periodIds } = await collectSampleIds(client);

    // Evaluations reference parameters/periods with no ON DELETE action, so clear
    // them (both student and group-own) before the things they point at.
    await client.query(
      `DELETE FROM evaluations
        WHERE group_id = ANY($1::uuid[])
           OR student_id = ANY($2::uuid[])
           OR parameter_id = ANY($3::uuid[])
           OR period_id = ANY($4::uuid[])`,
      [groupIds, studentIds, paramIds, periodIds]
    );
    // Assignments cascade from groups/params/periods anyway; delete explicitly to
    // be order-independent.
    await client.query(
      `DELETE FROM parameter_assignments
        WHERE parameter_id = ANY($1::uuid[]) OR group_id = ANY($2::uuid[]) OR student_id = ANY($3::uuid[])`,
      [paramIds, groupIds, studentIds]
    );
    await client.query(
      `DELETE FROM period_assignments
        WHERE period_id = ANY($1::uuid[]) OR group_id = ANY($2::uuid[]) OR student_id = ANY($3::uuid[])`,
      [periodIds, groupIds, studentIds]
    );
    await client.query('DELETE FROM student_group_members WHERE group_id = ANY($1::uuid[])', [groupIds]);
    // A single DELETE removes parent and child rows together, so the self-FK on
    // parent_id is satisfied at statement end.
    await client.query('DELETE FROM students WHERE id = ANY($1::uuid[])', [studentIds]);
    await client.query('DELETE FROM student_groups WHERE id = ANY($1::uuid[])', [groupIds]);
    await client.query('DELETE FROM parameters WHERE id = ANY($1::uuid[])', [paramIds]);
    await client.query('DELETE FROM periods WHERE id = ANY($1::uuid[])', [periodIds]);

    await client.query('COMMIT');
    console.log(
      `Removed sample data: ${studentIds.length} students, ${groupIds.length} groups, ` +
        `${paramIds.length} parameters, ${periodIds.length} periods and their scores.`
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function addSample() {
  const existing = await collectSampleIds(pool);
  if (existing.studentIds.length || existing.groupIds.length) {
    fail('Sample data already exists. Remove it first:  npm run seed-sample -- remove');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // --- Parameters (parents first, then leaves) ---
    const paramId = {};
    const leaves = [];
    for (let i = 0; i < PARAM_TREE.length; i++) {
      const node = PARAM_TREE[i];
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const row = await client.query(
        `INSERT INTO parameters (name, unit, min_value, max_value, norm_min, norm_max, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [node.name, node.unit ?? null, node.min ?? null, node.max ?? null, node.normMin ?? null, node.normMax ?? null, i]
      );
      paramId[node.key] = row.rows[0].id;
      if (!hasChildren) leaves.push({ ...node, id: row.rows[0].id });
      for (let j = 0; hasChildren && j < node.children.length; j++) {
        const child = node.children[j];
        const childRow = await client.query(
          `INSERT INTO parameters (parent_id, name, unit, min_value, max_value, norm_min, norm_max, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [paramId[node.key], child.name, child.unit ?? null, child.min ?? null, child.max ?? null, child.normMin ?? null, child.normMax ?? null, j]
        );
        paramId[child.key] = childRow.rows[0].id;
        leaves.push({ ...child, id: childRow.rows[0].id });
      }
    }

    // --- Groups (root, then classes) ---
    const groupId = {};
    const root = await client.query(
      `INSERT INTO student_groups (name, sort_order) VALUES ($1, 0) RETURNING id`,
      [GROUP_TREE.name]
    );
    groupId[GROUP_TREE.key] = root.rows[0].id;
    const classIds = [];
    for (let i = 0; i < GROUP_TREE.children.length; i++) {
      const child = GROUP_TREE.children[i];
      const row = await client.query(
        `INSERT INTO student_groups (name, parent_id, sort_order) VALUES ($1, $2, $3) RETURNING id`,
        [child.name, groupId[GROUP_TREE.key], i]
      );
      groupId[child.key] = row.rows[0].id;
      classIds.push(row.rows[0].id);
    }

    // --- Periods, assigned to the root group (inherited by both classes) ---
    const periodIds = [];
    for (let i = 0; i < PERIODS.length; i++) {
      const p = PERIODS[i];
      const row = await client.query(
        `INSERT INTO periods (name, start_date, end_date, sort_order) VALUES ($1, $2, $3, $4) RETURNING id`,
        [p.name, p.start, p.end, i]
      );
      periodIds.push(row.rows[0].id);
      await client.query(
        `INSERT INTO period_assignments (period_id, group_id) VALUES ($1, $2)`,
        [row.rows[0].id, groupId[GROUP_TREE.key]]
      );
    }

    // --- Students, split round-robin across the two classes ---
    const students = [];
    for (let i = 1; i <= STUDENT_COUNT; i++) {
      const name = `${STUDENT_PREFIX} ${String(i).padStart(2, '0')}`;
      const gender = GENDERS[i % GENDERS.length];
      const year = 2010 + (i % 5);
      const birthdate = `${year}-0${(i % 9) + 1}-1${i % 9}`;
      let id = null;
      while (id === null) {
        const inserted = await client.query(
          `INSERT INTO students (student_code, full_name, birthdate, gender)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (student_code) DO NOTHING
           RETURNING id`,
          [generateStudentCode(), name, birthdate, gender]
        );
        id = inserted.rows[0]?.id ?? null;
      }
      const group = classIds[i % classIds.length];
      await client.query(
        `INSERT INTO student_group_members (student_id, group_id) VALUES ($1, $2)`,
        [id, group]
      );
      students.push({ id, group, ability: i / STUDENT_COUNT });
    }

    // --- Evaluations: one per (class, student, leaf, period) ---
    let scoreCount = 0;
    for (const student of students) {
      for (let pIdx = 0; pIdx < periodIds.length; pIdx++) {
        for (const leaf of leaves) {
          const value = sampleValue(leaf, student.ability, pIdx);
          await client.query(
            `INSERT INTO evaluations (group_id, student_id, parameter_id, period_id, value)
             VALUES ($1, $2, $3, $4, $5)`,
            [student.group, student.id, leaf.id, periodIds[pIdx], value]
          );
          scoreCount++;
        }
      }
    }

    // --- A few group-own direct scores on the root group (student_id NULL) ---
    for (let pIdx = 0; pIdx < periodIds.length; pIdx++) {
      for (const leaf of leaves) {
        const value = sampleValue(leaf, 0.55, pIdx);
        await client.query(
          `INSERT INTO evaluations (group_id, student_id, parameter_id, period_id, value)
           VALUES ($1, NULL, $2, $3, $4)`,
          [groupId[GROUP_TREE.key], leaf.id, periodIds[pIdx], value]
        );
        scoreCount++;
      }
    }

    await client.query('COMMIT');
    console.log(
      `Seeded ${students.length} students across ${classIds.length} classes, ` +
        `${leaves.length} leaf parameters, ${periodIds.length} periods, and ${scoreCount} scores.`
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
    'Usage:\n' +
      '  npm run seed-sample            adds sample data\n' +
      '  npm run seed-sample -- remove  removes it'
  );
}
await pool.end();
