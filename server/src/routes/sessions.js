import { Router } from 'express';
import pool from '../db/pool.js';
import { recordAudit } from '../lib/audit.js';
import { isUuid } from '../lib/ids.js';
import { isValidIsoDate, periodForDate } from '../lib/periods.js';
import { generateSessions } from '../lib/sessions.js';

const router = Router();
const MAX_LISTED = 500;

const SESSION_COLUMNS = `
  s.id,
  s.assignment_id  AS "assignmentId",
  s.seq,
  s.code,
  s.planned_date   AS "plannedDate",
  s.moved_to       AS "movedTo",
  s.session_date   AS "sessionDate",
  s.canceled_at    AS "canceledAt",
  s.note,
  s.archived_at    AS "archivedAt",
  a.code           AS "assignmentCode",
  a.name           AS "assignmentName",
  t.full_name      AS "teacherName",
  a.group_id       AS "groupId",
  g.name           AS "groupName",
  a.membership_id  AS "membershipId",
  sf.full_name     AS "studentName"
`;

const SESSION_FROM = `
  FROM sessions s
  JOIN assignments a ON a.id = s.assignment_id
  JOIN teachers t ON t.id = a.teacher_id
  LEFT JOIN student_groups g ON g.id = a.group_id
  LEFT JOIN student_group_members ms ON ms.id = a.membership_id
  LEFT JOIN students sf ON sf.id = ms.student_id
`;

// The weekly-period calendar anchor, so each session can be labelled with the
// evaluation period its date falls into (the existing periods are untouched;
// this is a derived bridge).
async function readPeriodAnchor(db) {
  const result = await db.query(
    `SELECT value FROM settings WHERE key = 'period_anchor_date'`
  );
  return result.rows[0]?.value ?? null;
}

router.param('id', (req, res, next, value) => {
  if (!isUuid(value)) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  next();
});

router.get('/', async (req, res) => {
  const { assignmentId, teacherId, from, to } = req.query;
  const includeCanceled = req.query.includeCanceled === '1';
  const includeArchived = req.query.includeArchived === '1';

  const conditions = [includeArchived ? 'TRUE' : 's.archived_at IS NULL'];
  const values = [];
  const push = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (assignmentId !== undefined) {
    if (!isUuid(assignmentId)) {
      return res.status(400).json({ error: 'assignmentId must be a valid ID.' });
    }
    conditions.push(`s.assignment_id = ${push(assignmentId)}`);
  }
  if (teacherId !== undefined) {
    if (!isUuid(teacherId)) {
      return res.status(400).json({ error: 'teacherId must be a valid ID.' });
    }
    conditions.push(`a.teacher_id = ${push(teacherId)}`);
  }
  if (from !== undefined) {
    if (!isValidIsoDate(from)) {
      return res.status(400).json({ error: 'from must be a date (YYYY-MM-DD).' });
    }
    conditions.push(`s.session_date >= ${push(from)}::date`);
  }
  if (to !== undefined) {
    if (!isValidIsoDate(to)) {
      return res.status(400).json({ error: 'to must be a date (YYYY-MM-DD).' });
    }
    conditions.push(`s.session_date <= ${push(to)}::date`);
  }
  if (!includeCanceled) {
    conditions.push('s.canceled_at IS NULL');
  }

  const result = await pool.query(
    `SELECT ${SESSION_COLUMNS}
     ${SESSION_FROM}
     WHERE ${conditions.join(' AND ')}
     ORDER BY s.session_date, s.code
     LIMIT ${MAX_LISTED + 1}`,
    values
  );

  const anchor = await readPeriodAnchor(pool);
  const sessions = result.rows.slice(0, MAX_LISTED).map((session) => ({
    ...session,
    periodNumber: anchor ? periodForDate(anchor, session.sessionDate) : null,
  }));

  res.json({ sessions, truncated: result.rows.length > MAX_LISTED });
});

// Generate the missing planned sessions for active assignments, up to a
// horizon date. Idempotent: existing planned dates are skipped.
router.post('/generate', async (req, res) => {
  const until = req.body?.until;
  if (!isValidIsoDate(until)) {
    return res
      .status(400)
      .json({ error: 'until must be a real date written as YYYY-MM-DD.' });
  }
  const assignmentId = req.body?.assignmentId ?? null;
  if (assignmentId !== null && !isUuid(assignmentId)) {
    return res.status(400).json({ error: 'assignmentId must be a valid ID.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await generateSessions(client, { until, assignmentId });
    if (created > 0) {
      await recordAudit(client, {
        userId: req.user.id,
        actor: req.user.username,
        action: 'session.generate',
        entityType: 'session',
        details: { until, assignmentId, created },
      });
    }
    await client.query('COMMIT');
    res.status(201).json({ created, until });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Only the operational fields change: moving a session, canceling it, or
// annotating it. The planned date, sequence and code are immutable.
router.patch('/:id', async (req, res) => {
  const body = req.body ?? {};
  const sets = [];
  const values = [];

  if ('movedTo' in body) {
    const movedTo = body.movedTo;
    if (movedTo !== null && !isValidIsoDate(movedTo)) {
      return res
        .status(400)
        .json({ error: 'movedTo must be a date (YYYY-MM-DD) or null.' });
    }
    values.push(movedTo);
    sets.push(`moved_to = $${values.length}::date`);
  }
  if ('canceled' in body) {
    if (typeof body.canceled !== 'boolean') {
      return res.status(400).json({ error: 'canceled must be true or false.' });
    }
    sets.push(`canceled_at = ${body.canceled ? 'now()' : 'NULL'}`);
  }
  if ('note' in body) {
    const note = body.note;
    if (note !== null && typeof note !== 'string') {
      return res.status(400).json({ error: 'note must be text.' });
    }
    const trimmed = note?.trim() ?? '';
    if (trimmed.length > 500) {
      return res.status(400).json({ error: 'note must be 500 characters or fewer.' });
    }
    values.push(trimmed === '' ? null : trimmed);
    sets.push(`note = $${values.length}`);
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
  const result = await pool.query(
    `UPDATE sessions
     SET ${sets.join(', ')}
     WHERE id = $${values.length}
     RETURNING id`,
    values
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  const full = await pool.query(
    `SELECT ${SESSION_COLUMNS} ${SESSION_FROM} WHERE s.id = $1`,
    [req.params.id]
  );
  const anchor = await readPeriodAnchor(pool);
  res.json({
    session: {
      ...full.rows[0],
      periodNumber: anchor
        ? periodForDate(anchor, full.rows[0].sessionDate)
        : null,
    },
  });
});

export default router;
