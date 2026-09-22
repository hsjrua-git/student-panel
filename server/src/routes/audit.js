import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

const CATEGORIES = [
  'student',
  'parameter',
  'parameter_change',
  'settings',
  'scores',
  'user',
  'role',
  'group',
  'field',
  'auth',
  'api',
];
const PAGE_SIZE = 25;
const MAX_DETAIL_CHANGES = 50;

function toPositiveInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

router.get('/', async (req, res) => {
  const { category, actor } = req.query;
  const page = Math.min(toPositiveInt(req.query.page, 1), 100000);

  const conditions = [];
  const values = [];

  if (category !== undefined) {
    if (typeof category !== 'string' || !CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Unknown category.' });
    }
    values.push(category);
    conditions.push(`split_part(a.action, '.', 1) = $${values.length}`);
  }
  if (actor !== undefined) {
    if (typeof actor !== 'string' || actor === '' || actor.length > 64) {
      return res.status(400).json({ error: 'Invalid user filter.' });
    }
    values.push(actor.toLowerCase());
    conditions.push(`lower(a.actor) = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countResult, listResult] = await Promise.all([
    pool.query(`SELECT count(*)::int AS total FROM audit_log a ${where}`, values),
    pool.query(
      `SELECT a.id::text        AS id,
              a.occurred_at     AS "occurredAt",
              a.actor,
              a.action,
              a.entity_type     AS "entityType",
              a.entity_id       AS "entityId",
              a.details,
              s.full_name       AS "studentName",
              s.student_code    AS "studentCode",
              p.name            AS "parameterName",
              cp.name           AS "changeParameterName"
       FROM audit_log a
       LEFT JOIN students s
         ON a.entity_type = 'student' AND s.id::text = a.entity_id
       LEFT JOIN parameters p
         ON a.entity_type = 'parameter' AND p.id::text = a.entity_id
       LEFT JOIN parameters cp
         ON a.entity_type = 'parameter_change'
        AND cp.id::text = a.details->'result'->>'parameterId'
       ${where}
       ORDER BY a.occurred_at DESC, a.id DESC
       LIMIT ${PAGE_SIZE} OFFSET $${values.length + 1}`,
      [...values, (page - 1) * PAGE_SIZE]
    ),
  ]);

  const entries = listResult.rows.map((row) => {
    const changes = row.details?.changes;
    if (Array.isArray(changes) && changes.length > MAX_DETAIL_CHANGES) {
      return {
        ...row,
        details: {
          ...row.details,
          changes: changes.slice(0, MAX_DETAIL_CHANGES),
          moreChanges: changes.length - MAX_DETAIL_CHANGES,
        },
      };
    }
    return row;
  });

  res.json({
    entries,
    total: countResult.rows[0].total,
    page,
    pageSize: PAGE_SIZE,
  });
});

export default router;