import { Router } from 'express';
import pool from '../db/pool.js';
import { fetchGroupRows, groupSubtreeIds } from '../lib/groups.js';
import { isUuid } from '../lib/ids.js';

// The scores export: a flat, CSV-friendly dump of the raw scored cells joined to
// their group / student / parameter / period names. Scores are per group, so the
// natural scope is a group (optionally its whole subtree) and/or a set of
// periods. Both GET (comma-separated ids in the query string) and POST (id arrays
// in the body, for selections too large for a URL) run the same handler. The POST
// form is a read that self-reports here (listed in RECORDED_BY_THEIR_OWN_ROUTES),
// so the audit middleware does not log it as a change.

const router = Router();
const MAX_IDS = 5000;
const MAX_EXPORT_ROWS = 50000;

// Accept either an array (POST JSON body) or a comma-separated string (GET query
// string) and return a clean array of trimmed, non-empty strings.
function normalizeList(raw) {
  if (Array.isArray(raw)) return raw.map((value) => String(value).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
}

// Validate an id list: at most MAX_IDS entries, all valid UUIDs.
function parseIds(raw, label) {
  const ids = normalizeList(raw);
  if (ids.length > MAX_IDS) return { error: `Too many ${label} requested (max ${MAX_IDS}).` };
  if (ids.some((id) => !isUuid(id))) return { error: `${label} must all be valid IDs.` };
  return { ids };
}

async function handleCube(req, res) {
  const source = req.method === 'POST' ? req.body ?? {} : req.query;

  const { groupId, includeSubtree } = source;
  if (groupId !== undefined && !isUuid(groupId)) {
    return res.status(400).json({ error: 'groupId must be a valid ID.' });
  }

  const students = parseIds(source.studentIds, 'students');
  if (students.error) return res.status(400).json({ error: students.error });
  const parameters = parseIds(source.parameterIds, 'parameters');
  if (parameters.error) return res.status(400).json({ error: parameters.error });
  const periods = parseIds(source.periodIds, 'periods');
  if (periods.error) return res.status(400).json({ error: periods.error });

  const filters = [];
  const values = [];

  if (groupId !== undefined) {
    // Scope to the group, or to its whole subtree when includeSubtree is set.
    const wantSubtree = includeSubtree === true || includeSubtree === '1' || includeSubtree === 'true';
    let ids = [groupId];
    if (wantSubtree) {
      const groupRows = await fetchGroupRows(pool, { includeArchived: true });
      ids = groupSubtreeIds(groupRows, groupId);
    }
    values.push(ids);
    filters.push(`e.group_id = ANY($${values.length}::uuid[])`);
  }
  if (students.ids.length > 0) {
    values.push(students.ids);
    filters.push(`e.student_id = ANY($${values.length}::uuid[])`);
  }
  if (parameters.ids.length > 0) {
    values.push(parameters.ids);
    filters.push(`e.parameter_id = ANY($${values.length}::uuid[])`);
  }
  if (periods.ids.length > 0) {
    values.push(periods.ids);
    filters.push(`e.period_id = ANY($${values.length}::uuid[])`);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT e.group_id      AS "groupId",
            g.name          AS "groupName",
            e.student_id    AS "studentId",
            s.full_name     AS "studentName",
            s.student_code  AS "studentCode",
            e.parameter_id  AS "parameterId",
            p.name          AS "parameterName",
            p.unit,
            e.period_id     AS "periodId",
            per.name        AS "periodName",
            per.start_date  AS "startDate",
            per.end_date    AS "endDate",
            e.value::float8 AS value,
            e.comment,
            (e.locked_at IS NOT NULL) AS "isLocked"
       FROM evaluations e
       JOIN student_groups g ON g.id = e.group_id
       LEFT JOIN students s  ON s.id = e.student_id
       JOIN parameters p     ON p.id = e.parameter_id
       JOIN periods per      ON per.id = e.period_id
       ${where}
      ORDER BY g.name, per.start_date, per.sort_order,
               s.full_name NULLS FIRST, p.sort_order, lower(p.name)
      LIMIT ${MAX_EXPORT_ROWS + 1}`,
    values
  );

  const truncated = result.rows.length > MAX_EXPORT_ROWS;
  const rows = truncated ? result.rows.slice(0, MAX_EXPORT_ROWS) : result.rows;
  res.json({ rows, total: rows.length, truncated });
}

router.get('/cube', handleCube);
router.post('/cube', handleCube);

export default router;
