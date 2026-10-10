import { Router } from 'express';
import pool from '../db/pool.js';
import { generateStudentCode } from '../lib/studentCode.js';
import {
  normalizeBirthdate,
  normalizeFullName,
  normalizeGender,
} from '../validation/student.js';
import { recordAudit } from '../lib/audit.js';
import { fetchGroupRows, groupSubtreeIds } from '../lib/groups.js';
import { stripRestricted, validateExtra } from '../lib/fields.js';
import { isUuid } from '../lib/ids.js';
import { getOperatorName } from '../lib/settings.js';
import {
  classifyImportRows,
  importCounts,
  nameKey,
  validateImportBody,
} from '../lib/studentImport.js';

const router = Router();

// A viewer may reveal restricted custom-field values by opting in per request
// with ?revealRestricted=1 (this is a single-operator app: the flag is a soft
// privacy nudge, not an access control).
function wantsRestricted(req) {
  const raw = req.query.revealRestricted;
  return raw === '1' || raw === 'true';
}

// The live custom-field definitions, used to validate incoming values and to
// strip restricted values from responses.
async function loadDefinitions(db) {
  const result = await db.query(
    `SELECT id, label, field_type AS "fieldType", choices,
            is_restricted AS "isRestricted"
     FROM student_field_definitions
     WHERE archived_at IS NULL`
  );
  return result.rows;
}

function presentStudent(student, definitions, canSeeRestricted) {
  return {
    ...student,
    extra: stripRestricted(definitions, student.extra, canSeeRestricted),
  };
}

const UNIQUE_VIOLATION = '23505';
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const SORTS = {
  newest: 'created_at DESC, id',
  oldest: 'created_at ASC, id',
  name: 'lower(full_name), id',
  code: 'student_code, id',
};

const STUDENT_COLUMNS = `
  id,
  student_code AS "studentCode",
  full_name    AS "fullName",
  birthdate,
  gender,
  extra,
  created_at   AS "createdAt"
`;

function toPositiveInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function escapeLike(text) {
  return text.replace(/[\\%_]/g, '\\$&');
}

// Validate the mandatory create fields (name, birthdate, gender) together.
function parseCoreFields(body, { partial = false } = {}) {
  const values = {};
  if (!partial || 'fullName' in body) {
    const parsed = normalizeFullName(body.fullName);
    if (parsed.error) return { error: parsed.error };
    values.fullName = parsed.value;
  }
  if (!partial || 'birthdate' in body) {
    const parsed = normalizeBirthdate(body.birthdate);
    if (parsed.error) return { error: parsed.error };
    values.birthdate = parsed.value;
  }
  if (!partial || 'gender' in body) {
    const parsed = normalizeGender(body.gender);
    if (parsed.error) return { error: parsed.error };
    values.gender = parsed.value;
  }
  return { values };
}

router.param('id', (req, res, next, value) => {
  if (!isUuid(value)) {
    return res.status(404).json({ error: 'Student not found.' });
  }
  next();
});

router.post('/', async (req, res) => {
  const body = req.body ?? {};
  const core = parseCoreFields(body);
  if (core.error) {
    return res.status(400).json({ error: core.error });
  }

  const definitions = await loadDefinitions(pool);
  const extra = validateExtra(definitions, body.extra ?? {});
  if (extra.error) {
    return res.status(400).json({ error: extra.error });
  }

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const result = await pool.query(
        `INSERT INTO students (student_code, full_name, birthdate, gender, extra)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING ${STUDENT_COLUMNS}`,
        [
          generateStudentCode(),
          core.values.fullName,
          core.values.birthdate,
          core.values.gender,
          JSON.stringify(extra.value),
        ]
      );
      return res
        .status(201)
        .json(presentStudent(result.rows[0], definitions, wantsRestricted(req)));
    } catch (err) {
      if (err.code !== UNIQUE_VIOLATION) throw err;
    }
  }

  res
    .status(500)
    .json({ error: 'Could not create a unique student code. Please try again.' });
});

router.get('/', async (req, res) => {
  const search =
    typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search.length > 100) {
    return res.status(400).json({ error: 'Search text is too long.' });
  }

  const page = Math.min(toPositiveInt(req.query.page, 1), 1_000_000);
  const pageSize = Math.min(
    toPositiveInt(req.query.pageSize, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  );
  const sort = req.query.sort ?? 'newest';
  if (typeof sort !== 'string' || !Object.hasOwn(SORTS, sort)) {
    return res.status(400).json({ error: 'Unknown sort order.' });
  }

  const { groupId } = req.query;
  const ungrouped = req.query.ungrouped === '1' || req.query.ungrouped === 'true';
  if (groupId !== undefined && !isUuid(groupId)) {
    return res.status(400).json({ error: 'groupId must be a valid ID.' });
  }

  const conditions = ['deleted_at IS NULL'];
  const values = [];

  if (groupId !== undefined) {
    // Filtering by a group includes every student in it or its subgroups.
    const groupRows = await fetchGroupRows(pool, { includeArchived: true });
    const groupIds = groupSubtreeIds(groupRows, groupId);
    values.push(groupIds);
    conditions.push(
      `id IN (SELECT student_id FROM student_group_members
              WHERE group_id = ANY($${values.length}::uuid[]))`
    );
  } else if (ungrouped) {
    // Students not placed in any group (they have no evaluations yet).
    conditions.push(
      `id NOT IN (SELECT student_id FROM student_group_members)`
    );
  }

  if (search) {
    values.push(`%${escapeLike(search)}%`);
    let condition = `full_name ILIKE $${values.length}`;

    const codeText = search.replace(/[-\s]/g, '');
    if (codeText) {
      values.push(`%${escapeLike(codeText)}%`);
      condition += ` OR student_code ILIKE $${values.length}`;
    }
    conditions.push(`(${condition})`);
  }

  const where = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT count(*)::int AS total FROM students WHERE ${where}`,
    values
  );

  const listResult = await pool.query(
    `SELECT ${STUDENT_COLUMNS}
     FROM students
     WHERE ${where}
     ORDER BY ${SORTS[sort]}
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, (page - 1) * pageSize]
  );

  const definitions = await loadDefinitions(pool);
  const canSeeRestricted = wantsRestricted(req);

  res.json({
    students: listResult.rows.map((student) =>
      presentStudent(student, definitions, canSeeRestricted)
    ),
    total: countResult.rows[0].total,
    page,
    pageSize,
  });
});

router.patch('/:id', async (req, res) => {
  const body = req.body ?? {};
  if ('studentCode' in body) {
    return res.status(400).json({ error: 'Student codes cannot be changed.' });
  }

  const core = parseCoreFields(body, { partial: true });
  if (core.error) {
    return res.status(400).json({ error: core.error });
  }
  const hasExtra = 'extra' in body;
  if (Object.keys(core.values).length === 0 && !hasExtra) {
    return res.status(400).json({ error: 'Nothing to change.' });
  }

  const sets = [];
  const values = [];

  const columnFor = { fullName: 'full_name', birthdate: 'birthdate', gender: 'gender' };
  for (const [key, column] of Object.entries(columnFor)) {
    if (key in core.values) {
      values.push(core.values[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }

  const definitions = await loadDefinitions(pool);
  if (hasExtra) {
    const extra = validateExtra(definitions, body.extra);
    if (extra.error) {
      return res.status(400).json({ error: extra.error });
    }
    // Keys sent as empty/null are cleared; the rest are merged in.
    const clearKeys = Object.keys(body.extra).filter(
      (key) => !(key in extra.value)
    );
    values.push(JSON.stringify(extra.value));
    const mergeIndex = values.length;
    values.push(clearKeys);
    const clearIndex = values.length;
    sets.push(
      `extra = (extra || $${mergeIndex}::jsonb) - $${clearIndex}::text[]`
    );
  }

  values.push(req.params.id);
  const result = await pool.query(
    `UPDATE students
     SET ${sets.join(', ')}
     WHERE id = $${values.length} AND deleted_at IS NULL
     RETURNING ${STUDENT_COLUMNS}`,
    values
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Student not found.' });
  }
  res.json(presentStudent(result.rows[0], definitions, wantsRestricted(req)));
});

router.delete('/:id', async (req, res) => {
  const result = await pool.query(
    `UPDATE students
     SET deleted_at = now()
     WHERE id = $1 AND deleted_at IS NULL`,
    [req.params.id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Student not found.' });
  }
  res.status(204).end();
});

router.get('/:id', async (req, res) => {
  const result = await pool.query(
    `SELECT ${STUDENT_COLUMNS}
     FROM students
     WHERE id = $1 AND deleted_at IS NULL`,
    [req.params.id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Student not found.' });
  }
  const definitions = await loadDefinitions(pool);
  res.json(presentStudent(result.rows[0], definitions, wantsRestricted(req)));
});

router.post('/import', async (req, res) => {
  const parsed = validateImportBody(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }
  const { rows, allowDuplicateNames, dryRun } = parsed;

  const existingResult = await pool.query(
    `SELECT full_name    AS "fullName",
            student_code AS "studentCode"
     FROM students
     WHERE deleted_at IS NULL`
  );
  const existing = new Map();
  for (const student of existingResult.rows) {
    const key = nameKey(student.fullName);
    if (!existing.has(key)) existing.set(key, student.studentCode);
  }

  const classified = classifyImportRows({ rows, existing, allowDuplicateNames });
  const counts = importCounts(classified);

  if (dryRun) {
    return res.json({ dryRun: true, rows: classified, counts });
  }
  if (counts.willImport === 0) {
    return res.status(400).json({
      error: 'There are no rows to import.',
      rows: classified,
      counts,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const created = [];
    for (const item of classified) {
      if (!item.willImport) continue;

      let student = null;
      for (let attempt = 1; attempt <= 5 && student === null; attempt++) {
        const inserted = await client.query(
          `INSERT INTO students (student_code, full_name, birthdate, gender)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (student_code) DO NOTHING
           RETURNING ${STUDENT_COLUMNS}`,
          [generateStudentCode(), item.fullName, item.birthdate, item.gender]
        );
        student = inserted.rows[0] ?? null;
      }
      if (student === null) {
        throw new Error('Could not create a unique student code.');
      }
      created.push({ row: item.row, ...student });
    }

    await recordAudit(client, {
      actor: await getOperatorName(),
      action: 'student.import',
      entityType: 'student',
      details: {
        count: created.length,
        skipped: classified.length - created.length,
        allowDuplicateNames,
        students: created.slice(0, 50).map((student) => ({
          fullName: student.fullName,
          studentCode: student.studentCode,
        })),
        moreStudents: Math.max(0, created.length - 50),
      },
    });

    await client.query('COMMIT');
    res.status(201).json({ dryRun: false, created, rows: classified, counts });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

export default router;
