import { Router } from 'express';
import pool from '../db/pool.js';
import { fetchPeriod } from '../lib/periods.js';
import { isUuid } from '../lib/ids.js';

// Periods: named, dated scoring rounds designed on the Periods page and assigned
// to students and/or groups. "Anchored until changed" — editing a period edits
// its row; scores keep pointing at the same period_id, so re-dating or renaming
// never orphans a score. Standard create/update/delete are auto-audited by the
// middleware.

const router = Router();
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const FK_VIOLATION = '23503';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const PERIOD_COLUMNS = `
  id,
  name,
  start_date  AS "startDate",
  end_date    AS "endDate",
  sort_order  AS "sortOrder",
  archived_at AS "archivedAt"
`;

const ASSIGNMENT_COLUMNS = `
  id,
  period_id  AS "periodId",
  group_id   AS "groupId",
  student_id AS "studentId",
  created_at AS "createdAt"
`;

function parseName(input) {
  if (typeof input !== 'string') return { error: 'Period name is required.' };
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length < 1 || value.length > 60) {
    return { error: 'Period name must be 1 to 60 characters.' };
  }
  return { value };
}

// A real calendar date written as YYYY-MM-DD.
function parseDate(input) {
  if (typeof input !== 'string' || !ISO_DATE.test(input)) {
    return { error: 'Dates must be written as YYYY-MM-DD.' };
  }
  const date = new Date(`${input}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input) {
    return { error: 'That is not a real date.' };
  }
  return { value: input };
}

router.param('id', (req, res, next, value) => {
  if (!isUuid(value)) return res.status(404).json({ error: 'Period not found.' });
  next();
});

// List periods with an assignment count. ?includeArchived=1 includes archived.
router.get('/', async (req, res) => {
  const includeArchived = req.query.includeArchived === '1';
  const result = await pool.query(
    `SELECT ${PERIOD_COLUMNS},
            COALESCE(a.count, 0) AS "assignmentCount"
       FROM periods p
       LEFT JOIN (
         SELECT period_id, count(*)::int AS count
           FROM period_assignments GROUP BY period_id
       ) a ON a.period_id = p.id
      WHERE ($1 OR p.archived_at IS NULL)
      ORDER BY p.start_date, p.sort_order, lower(p.name)`,
    [includeArchived]
  );
  res.json({ periods: result.rows });
});

// A single period with the groups/students it is assigned to (names resolved).
router.get('/:id', async (req, res) => {
  const period = await fetchPeriod(pool, req.params.id);
  if (!period) return res.status(404).json({ error: 'Period not found.' });
  const assignments = await pool.query(
    `SELECT ${ASSIGNMENT_COLUMNS},
            g.name         AS "groupName",
            s.full_name    AS "studentName",
            s.student_code AS "studentCode"
       FROM period_assignments pa
       LEFT JOIN student_groups g ON g.id = pa.group_id
       LEFT JOIN students s       ON s.id = pa.student_id
      WHERE pa.period_id = $1
      ORDER BY pa.created_at`,
    [req.params.id]
  );
  res.json({ ...period, assignments: assignments.rows });
});

router.post('/', async (req, res) => {
  const body = req.body ?? {};
  const name = parseName(body.name);
  if (name.error) return res.status(400).json({ error: name.error });
  const start = parseDate(body.startDate);
  if (start.error) return res.status(400).json({ error: start.error });
  const end = parseDate(body.endDate);
  if (end.error) return res.status(400).json({ error: end.error });
  if (start.value > end.value) {
    return res.status(400).json({ error: 'The start date cannot be after the end date.' });
  }

  const inserted = await pool.query(
    `INSERT INTO periods (name, start_date, end_date, sort_order)
     VALUES ($1, $2, $3, (SELECT COALESCE(max(sort_order), 0) + 1 FROM periods))
     RETURNING ${PERIOD_COLUMNS}`,
    [name.value, start.value, end.value]
  );
  res.status(201).json({ ...inserted.rows[0], assignmentCount: 0 });
});

router.patch('/:id', async (req, res) => {
  const body = req.body ?? {};
  const sets = [];
  const values = [];

  if ('name' in body) {
    const name = parseName(body.name);
    if (name.error) return res.status(400).json({ error: name.error });
    values.push(name.value);
    sets.push(`name = $${values.length}`);
  }
  if ('startDate' in body) {
    const start = parseDate(body.startDate);
    if (start.error) return res.status(400).json({ error: start.error });
    values.push(start.value);
    sets.push(`start_date = $${values.length}`);
  }
  if ('endDate' in body) {
    const end = parseDate(body.endDate);
    if (end.error) return res.status(400).json({ error: end.error });
    values.push(end.value);
    sets.push(`end_date = $${values.length}`);
  }
  if ('sortOrder' in body) {
    if (!Number.isInteger(body.sortOrder)) {
      return res.status(400).json({ error: 'sortOrder must be a whole number.' });
    }
    values.push(body.sortOrder);
    sets.push(`sort_order = $${values.length}`);
  }
  if ('archived' in body) {
    if (typeof body.archived !== 'boolean') {
      return res.status(400).json({ error: 'archived must be true or false.' });
    }
    sets.push(`archived_at = ${body.archived ? 'now()' : 'NULL'}`);
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'Nothing to change.' });
  }

  values.push(req.params.id);
  try {
    const updated = await pool.query(
      `UPDATE periods SET ${sets.join(', ')}
        WHERE id = $${values.length}
        RETURNING ${PERIOD_COLUMNS}`,
      values
    );
    if (updated.rowCount === 0) return res.status(404).json({ error: 'Period not found.' });
    res.json(updated.rows[0]);
  } catch (err) {
    if (err.code === CHECK_VIOLATION) {
      return res.status(400).json({ error: 'The start date cannot be after the end date.' });
    }
    throw err;
  }
});

// DELETE soft-archives the period (its scores stay).
router.delete('/:id', async (req, res) => {
  const updated = await pool.query(
    `UPDATE periods SET archived_at = now()
      WHERE id = $1 AND archived_at IS NULL
      RETURNING id`,
    [req.params.id]
  );
  if (updated.rowCount === 0) {
    const exists = await pool.query('SELECT 1 FROM periods WHERE id = $1', [req.params.id]);
    return exists.rowCount === 0
      ? res.status(404).json({ error: 'Period not found.' })
      : res.status(204).end();
  }
  res.status(204).end();
});

// Assign a period to exactly one target (a group or a student).
router.post('/:id/assignments', async (req, res) => {
  const body = req.body ?? {};
  const groupId = body.groupId ?? null;
  const studentId = body.studentId ?? null;

  if ((groupId !== null) === (studentId !== null)) {
    return res.status(400).json({ error: 'Assign to exactly one of a group or a student.' });
  }
  if (groupId !== null && !isUuid(groupId)) {
    return res.status(400).json({ error: 'groupId must be a valid ID.' });
  }
  if (studentId !== null && !isUuid(studentId)) {
    return res.status(400).json({ error: 'studentId must be a valid ID.' });
  }

  const period = await pool.query('SELECT 1 FROM periods WHERE id = $1', [req.params.id]);
  if (period.rowCount === 0) return res.status(404).json({ error: 'Period not found.' });

  try {
    const inserted = await pool.query(
      `INSERT INTO period_assignments (period_id, group_id, student_id)
       VALUES ($1, $2, $3)
       RETURNING ${ASSIGNMENT_COLUMNS}`,
      [req.params.id, groupId, studentId]
    );
    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'That period is already assigned there.' });
    }
    if (err.code === FK_VIOLATION) {
      return res.status(400).json({ error: 'The group or student does not exist.' });
    }
    throw err;
  }
});

router.delete('/:id/assignments/:assignmentId', async (req, res) => {
  if (!isUuid(req.params.assignmentId)) {
    return res.status(404).json({ error: 'Assignment not found.' });
  }
  const result = await pool.query(
    'DELETE FROM period_assignments WHERE id = $1 AND period_id = $2',
    [req.params.assignmentId, req.params.id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Assignment not found.' });
  }
  res.status(204).end();
});

export default router;
