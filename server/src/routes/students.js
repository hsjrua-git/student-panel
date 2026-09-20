import { Router } from 'express';
import pool from '../db/pool.js';
import { generateStudentCode } from '../lib/studentCode.js';
import { normalizeFullName } from '../validation/student.js';

const router = Router();

const UNIQUE_VIOLATION = '23505';

const STUDENT_COLUMNS = `
  id,
  student_code AS "studentCode",
  full_name    AS "fullName",
  created_at   AS "createdAt"
`;

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
  const result = await pool.query(
    `SELECT ${STUDENT_COLUMNS}
     FROM students
     WHERE deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 500`
  );
  res.json({ students: result.rows });
});

export default router;