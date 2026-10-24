import { Router } from 'express';
import pool from '../db/pool.js';
import { recordAudit } from '../lib/audit.js';
import { isUuid } from '../lib/ids.js';
import { parseTaskFields } from '../validation/schedule.js';

const router = Router();
const MAX_SESSIONS_PER_ASSIGN = 200;

const TASK_COLUMNS = `
  id,
  session_id  AS "sessionId",
  template_id AS "templateId",
  title,
  description,
  done,
  done_at     AS "doneAt",
  sort_order  AS "sortOrder",
  created_at  AS "createdAt"
`;

router.param('id', (req, res, next, value) => {
  if (!isUuid(value)) {
    return res.status(404).json({ error: 'Task not found.' });
  }
  next();
});

router.get('/', async (req, res) => {
  const { sessionId } = req.query;
  if (!isUuid(sessionId)) {
    return res.status(400).json({ error: 'sessionId must be a valid ID.' });
  }
  const result = await pool.query(
    `SELECT ${TASK_COLUMNS}
     FROM tasks
     WHERE session_id = $1
     ORDER BY sort_order, created_at`,
    [sessionId]
  );
  res.json({ tasks: result.rows });
});

router.post('/', async (req, res) => {
  const { sessionId } = req.body ?? {};
  if (!isUuid(sessionId)) {
    return res.status(400).json({ error: 'sessionId must be a valid ID.' });
  }
  const parsed = parseTaskFields(req.body ?? {});
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const session = await pool.query(
    'SELECT id FROM sessions WHERE id = $1 AND archived_at IS NULL',
    [sessionId]
  );
  if (session.rowCount === 0) {
    return res
      .status(400)
      .json({ error: 'That session does not exist or is archived.' });
  }

  const result = await pool.query(
    `INSERT INTO tasks (session_id, title, description, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING ${TASK_COLUMNS}`,
    [
      sessionId,
      parsed.value.title,
      parsed.value.description ?? null,
      parsed.value.sortOrder ?? 0,
    ]
  );
  res.status(201).json({ task: result.rows[0] });
});

// Snapshot a template into one task row per session. Copies are independent:
// later template edits never change them.
router.post('/from-template', async (req, res) => {
  const { templateId } = req.body ?? {};
  const sessionIds = Array.isArray(req.body?.sessionIds) ? req.body.sessionIds : [];
  if (!isUuid(templateId)) {
    return res.status(400).json({ error: 'templateId must be a valid ID.' });
  }
  if (
    sessionIds.length === 0 ||
    sessionIds.length > MAX_SESSIONS_PER_ASSIGN ||
    !sessionIds.every((id) => isUuid(id))
  ) {
    return res.status(400).json({
      error: `sessionIds must be 1 to ${MAX_SESSIONS_PER_ASSIGN} valid IDs.`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const template = await client.query(
      `SELECT id, title, description, sort_order AS "sortOrder"
       FROM task_templates
       WHERE id = $1 AND archived_at IS NULL`,
      [templateId]
    );
    if (template.rowCount === 0) {
      await client.query('ROLLBACK');
      return res
        .status(400)
        .json({ error: 'That template does not exist or is archived.' });
    }

    const result = await client.query(
      `INSERT INTO tasks (session_id, template_id, title, description, sort_order)
       SELECT s.id, $1, $2, $3, $4
       FROM sessions s
       WHERE s.id = ANY($5::uuid[]) AND s.archived_at IS NULL
       RETURNING id`,
      [
        templateId,
        template.rows[0].title,
        template.rows[0].description,
        template.rows[0].sortOrder,
        sessionIds,
      ]
    );

    if (result.rowCount > 0) {
      await recordAudit(client, {
        userId: req.user.id,
        actor: req.user.username,
        action: 'task.assign_template',
        entityType: 'task',
        details: {
          templateId,
          requested: sessionIds.length,
          created: result.rowCount,
        },
      });
    }
    await client.query('COMMIT');
    res.status(201).json({ created: result.rowCount });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.patch('/:id', async (req, res) => {
  const body = req.body ?? {};
  const parsed = parseTaskFields(body, { partial: true });
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }
  if ('done' in body && typeof body.done !== 'boolean') {
    return res.status(400).json({ error: 'done must be true or false.' });
  }

  const sets = [];
  const values = [];
  if ('title' in parsed.value) {
    values.push(parsed.value.title);
    sets.push(`title = $${values.length}`);
  }
  if ('description' in parsed.value) {
    values.push(parsed.value.description);
    sets.push(`description = $${values.length}`);
  }
  if ('sortOrder' in parsed.value) {
    values.push(parsed.value.sortOrder);
    sets.push(`sort_order = $${values.length}`);
  }
  if ('done' in body) {
    // done_at must be set exactly when done is true (tasks_done_ck); setting
    // done keeps the FIRST time it was completed.
    if (body.done) {
      sets.push('done = true, done_at = COALESCE(done_at, now())');
    } else {
      sets.push('done = false, done_at = NULL');
    }
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: 'Nothing to change.' });
  }

  values.push(req.params.id);
  const result = await pool.query(
    `UPDATE tasks
     SET ${sets.join(', ')}
     WHERE id = $${values.length}
     RETURNING ${TASK_COLUMNS}`,
    values
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Task not found.' });
  }
  res.json({ task: result.rows[0] });
});

// Tasks are meant to be deleted when they are no longer useful; the audit
// middleware keeps the history.
router.delete('/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM tasks WHERE id = $1', [
    req.params.id,
  ]);
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Task not found.' });
  }
  res.status(204).end();
});

export default router;
