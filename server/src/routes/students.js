import { Router } from 'express';
import pool from '../db/pool.js';
import { generateStudentCode } from '../lib/studentCode.js';
import { normalizeFullName } from '../validation/student.js';

const router = Router();

const UNIQUE_VIOLATION = '23505';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const STUDENT_COLUMNS = `
  id,
  student_code AS "studentCode",
  full_name    AS "fullName",
  created_at   AS "createdAt"
`;

function toPositiveInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function escapeLike(text) {
  return text.replace(/[\\%_]/g, '\\$&');
}

router.param('id', (req, res, next, value) => {
  if (!UUID_PATTERN.test(value)) {
    return res.status(404).json({ error: 'Student not found.' });
  }
  next();
});

router.post('/', async (req, res) => {
  const parsed = normalizeFullName(req.body?.fullName);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const result = await pool.query(
        `INSERT INTO students (student_code, full_name)
         VALUES ($1, $2)
         RETURNING ${STUDENT_COLUMNS}`,
        [generateStudentCode(), parsed.value]
      );
      return res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code !== UNIQUE_VIOLATION) throw err;
    }
  }

  res.status(500).json({ error: 'Could not create a unique student code. Please try again.' });
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

  const conditions = ['deleted_at IS NULL'];
  const values = [];

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
     ORDER BY created_at DESC, id
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, (page - 1) * pageSize]
  );

  res.json({
    students: listResult.rows,
    total: countResult.rows[0].total,
    page,
    pageSize,
  });
});

router.patch('/:id', async (req, res) => {
  if (req.body && 'studentCode' in req.body) {
    return res.status(400).json({ error: 'Student codes cannot be changed.' });
  }

  const parsed = normalizeFullName(req.body?.fullName);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const result = await pool.query(
    `UPDATE students
     SET full_name = $1
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING ${STUDENT_COLUMNS}`,
    [parsed.value, req.params.id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Student not found.' });
  }
  res.json(result.rows[0]);
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
  res.json(result.rows[0]);
});

export default router;