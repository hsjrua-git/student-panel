import { Router } from 'express';
import pool from '../db/pool.js';
import { recordAudit } from '../lib/audit.js';
import { getOperatorName } from '../lib/settings.js';
import { isUuid } from '../lib/ids.js';

// Tasks: work items assigned to students and/or groups. Properties are kept
// deliberately open (`extra` jsonb). Each assignment carries a `done` checkbox
// whose effect on evaluation is decided later; for now it is recorded and shown.
//
// Standard task CRUD is auto-audited by the middleware. The per-assignment
// completion toggle writes its own richer audit entry (task.completion) and is
// listed in RECORDED_BY_THEIR_OWN_ROUTES so the middleware skips it.

const router = Router();
const UNIQUE_VIOLATION = '23505';
const FK_VIOLATION = '23503';

const TASK_COLUMNS = `
  id,
  title,
  description,
  parameter_id AS "parameterId",
  extra,
  sort_order   AS "sortOrder",
  archived_at  AS "archivedAt",
  created_at   AS "createdAt"
`;

const ASSIGNMENT_COLUMNS = `
  id,
  task_id    AS "taskId",
  group_id   AS "groupId",
  student_id AS "studentId",
  period_id  AS "periodId",
  done,
  done_at    AS "doneAt",
  created_at AS "createdAt"
`;

function parseTitle(input) {
  if (typeof input !== 'string') return { error: 'Task title is required.' };
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length < 1 || value.length > 120) {
    return { error: 'Task title must be 1 to 120 characters.' };
  }
  return { value };
}

// description: string up to 2000 chars, or null/'' to clear.
function parseDescription(input) {
  if (input === null || input === undefined || input === '') return { value: null };
  if (typeof input !== 'string') return { error: 'Description must be text.' };
  if (input.length > 2000) return { error: 'Description is too long (max 2000).' };
  return { value: input };
}

function parseExtra(input) {
  if (input === undefined) return { value: {} };
  if (input === null) return { value: {} };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'extra must be an object.' };
  }
  return { value: input };
}

router.param('id', (req, res, next, value) => {
  if (!isUuid(value)) return res.status(404).json({ error: 'Task not found.' });
  next();
});

// List tasks with a small completion summary (how many assignments, how many
// done). Live tasks only unless ?includeArchived=1.
router.get('/', async (req, res) => {
  const includeArchived = req.query.includeArchived === '1';
  const result = await pool.query(
    `SELECT ${TASK_COLUMNS},
            COALESCE(a.total, 0) AS "assignmentCount",
            COALESCE(a.done, 0)  AS "doneCount"
       FROM tasks t
       LEFT JOIN (
         SELECT task_id,
                count(*)::int                              AS total,
                count(*) FILTER (WHERE done)::int          AS done
           FROM task_assignments GROUP BY task_id
       ) a ON a.task_id = t.id
      WHERE ($1 OR t.archived_at IS NULL)
      ORDER BY t.sort_order, lower(t.title)`,
    [includeArchived]
  );
  res.json({ tasks: result.rows });
});

// A single task plus its assignments (with the target's name resolved).
router.get('/:id', async (req, res) => {
  const taskResult = await pool.query(
    `SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1`,
    [req.params.id]
  );
  if (taskResult.rowCount === 0) {
    return res.status(404).json({ error: 'Task not found.' });
  }
  const assignments = await pool.query(
    `SELECT ${ASSIGNMENT_COLUMNS},
            g.name           AS "groupName",
            s.full_name      AS "studentName",
            s.student_code   AS "studentCode",
            p.name           AS "periodName"
       FROM task_assignments ta
       LEFT JOIN student_groups g ON g.id = ta.group_id
       LEFT JOIN students s       ON s.id = ta.student_id
       LEFT JOIN periods p        ON p.id = ta.period_id
      WHERE ta.task_id = $1
      ORDER BY ta.created_at`,
    [req.params.id]
  );
  res.json({ ...taskResult.rows[0], assignments: assignments.rows });
});

router.post('/', async (req, res) => {
  const body = req.body ?? {};
  const title = parseTitle(body.title);
  if (title.error) return res.status(400).json({ error: title.error });
  const description = parseDescription(body.description);
  if (description.error) return res.status(400).json({ error: description.error });
  const extra = parseExtra(body.extra);
  if (extra.error) return res.status(400).json({ error: extra.error });

  const parameterId = body.parameterId ?? null;
  if (parameterId !== null && !isUuid(parameterId)) {
    return res.status(400).json({ error: 'parameterId must be a valid ID.' });
  }

  try {
    const inserted = await pool.query(
      `INSERT INTO tasks (title, description, parameter_id, extra, sort_order)
       VALUES ($1, $2, $3, $4::jsonb,
               (SELECT COALESCE(max(sort_order), 0) + 1 FROM tasks))
       RETURNING ${TASK_COLUMNS}`,
      [title.value, description.value, parameterId, JSON.stringify(extra.value)]
    );
    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    if (err.code === FK_VIOLATION) {
      return res.status(400).json({ error: 'That parameter does not exist.' });
    }
    throw err;
  }
});

router.patch('/:id', async (req, res) => {
  const body = req.body ?? {};
  const sets = [];
  const values = [];

  if ('title' in body) {
    const title = parseTitle(body.title);
    if (title.error) return res.status(400).json({ error: title.error });
    values.push(title.value);
    sets.push(`title = $${values.length}`);
  }
  if ('description' in body) {
    const description = parseDescription(body.description);
    if (description.error) return res.status(400).json({ error: description.error });
    values.push(description.value);
    sets.push(`description = $${values.length}`);
  }
  if ('parameterId' in body) {
    const parameterId = body.parameterId ?? null;
    if (parameterId !== null && !isUuid(parameterId)) {
      return res.status(400).json({ error: 'parameterId must be a valid ID.' });
    }
    values.push(parameterId);
    sets.push(`parameter_id = $${values.length}`);
  }
  if ('extra' in body) {
    const extra = parseExtra(body.extra);
    if (extra.error) return res.status(400).json({ error: extra.error });
    values.push(JSON.stringify(extra.value));
    sets.push(`extra = $${values.length}::jsonb`);
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
      `UPDATE tasks SET ${sets.join(', ')}
       WHERE id = $${values.length}
       RETURNING ${TASK_COLUMNS}`,
      values
    );
    if (updated.rowCount === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    res.json(updated.rows[0]);
  } catch (err) {
    if (err.code === FK_VIOLATION) {
      return res.status(400).json({ error: 'That parameter does not exist.' });
    }
    throw err;
  }
});

// DELETE archives the task (assignments cascade only on a hard delete, so an
// archived task keeps its assignment history).
router.delete('/:id', async (req, res) => {
  const updated = await pool.query(
    `UPDATE tasks SET archived_at = now()
     WHERE id = $1 AND archived_at IS NULL
     RETURNING id`,
    [req.params.id]
  );
  if (updated.rowCount === 0) {
    const exists = await pool.query('SELECT 1 FROM tasks WHERE id = $1', [req.params.id]);
    return exists.rowCount === 0
      ? res.status(404).json({ error: 'Task not found.' })
      : res.status(204).end();
  }
  res.status(204).end();
});

// Assign a task to exactly one target (a group or a student), optionally scoped
// to a period.
router.post('/:id/assignments', async (req, res) => {
  const body = req.body ?? {};
  const groupId = body.groupId ?? null;
  const studentId = body.studentId ?? null;
  const periodId = body.periodId ?? null;

  const hasGroup = groupId !== null;
  const hasStudent = studentId !== null;
  if (hasGroup === hasStudent) {
    return res.status(400).json({ error: 'Assign to exactly one of a group or a student.' });
  }
  if (hasGroup && !isUuid(groupId)) {
    return res.status(400).json({ error: 'groupId must be a valid ID.' });
  }
  if (hasStudent && !isUuid(studentId)) {
    return res.status(400).json({ error: 'studentId must be a valid ID.' });
  }
  if (periodId !== null && !isUuid(periodId)) {
    return res.status(400).json({ error: 'periodId must be a valid ID.' });
  }

  const task = await pool.query('SELECT 1 FROM tasks WHERE id = $1', [req.params.id]);
  if (task.rowCount === 0) return res.status(404).json({ error: 'Task not found.' });

  try {
    const inserted = await pool.query(
      `INSERT INTO task_assignments (task_id, group_id, student_id, period_id)
       VALUES ($1, $2, $3, $4)
       RETURNING ${ASSIGNMENT_COLUMNS}`,
      [req.params.id, groupId, studentId, periodId]
    );
    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'That task is already assigned there for this period.' });
    }
    if (err.code === FK_VIOLATION) {
      return res.status(400).json({ error: 'The group, student or period does not exist.' });
    }
    throw err;
  }
});

router.delete('/:id/assignments/:assignmentId', async (req, res) => {
  if (!isUuid(req.params.assignmentId)) {
    return res.status(404).json({ error: 'Assignment not found.' });
  }
  const result = await pool.query(
    `DELETE FROM task_assignments WHERE id = $1 AND task_id = $2`,
    [req.params.assignmentId, req.params.id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Assignment not found.' });
  }
  res.status(204).end();
});

// Toggle a single assignment's completion checkbox. Self-audited as
// task.completion (skipped by the generic middleware).
router.put('/:id/completion', async (req, res) => {
  const body = req.body ?? {};
  const { assignmentId } = body;
  if (!isUuid(assignmentId)) {
    return res.status(400).json({ error: 'assignmentId must be a valid ID.' });
  }
  if (typeof body.done !== 'boolean') {
    return res.status(400).json({ error: 'done must be true or false.' });
  }

  const updated = await pool.query(
    `UPDATE task_assignments
        SET done = $1, done_at = ${body.done ? 'now()' : 'NULL'}
      WHERE id = $2 AND task_id = $3
      RETURNING ${ASSIGNMENT_COLUMNS}`,
    [body.done, assignmentId, req.params.id]
  );
  if (updated.rowCount === 0) {
    return res.status(404).json({ error: 'Assignment not found.' });
  }

  await recordAudit(pool, {
    actor: await getOperatorName(),
    action: 'task.completion',
    entityType: 'task',
    entityId: req.params.id,
    details: { assignmentId, done: body.done },
  });
  res.json(updated.rows[0]);
});

export default router;
