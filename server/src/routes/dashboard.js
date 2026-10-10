import { Router } from 'express';
import pool from '../db/pool.js';
import { isUuid } from '../lib/ids.js';
import {
  fetchParameterRows,
  buildParameterTree,
  leafIds,
  rollupValues,
} from '../lib/parameters.js';
import { fetchGroupRows, fetchDirectMembers } from '../lib/groups.js';
import { fetchPeriodRows } from '../lib/periods.js';
import { flattenForest } from '../lib/tree.js';

// Read-only dashboard aggregates. All GETs, so the audit middleware ignores them.

const router = Router();

// A time series across periods for one group. By default it tracks the group's
// OWN scores (student_id NULL); pass studentId to track one member instead.
// Returns the parameter tree (with effective norms for markers), the periods
// that carry data (date-ordered), and the rolled-up value per (parameter, period).
router.get('/trends', async (req, res) => {
  const { groupId, studentId } = req.query;
  if (!isUuid(groupId)) return res.status(400).json({ error: 'groupId must be a valid ID.' });
  if (studentId !== undefined && !isUuid(studentId)) {
    return res.status(400).json({ error: 'studentId must be a valid ID.' });
  }

  const groupRows = await fetchGroupRows(pool, { includeArchived: true });
  const group = groupRows.find((g) => g.id === groupId);
  if (!group || group.archivedAt) return res.status(404).json({ error: 'Group not found.' });

  if (studentId !== undefined) {
    const members = await fetchDirectMembers(pool, groupId);
    if (!members.some((m) => m.id === studentId)) {
      return res.status(404).json({ error: 'That student is not a member of the group.' });
    }
  }

  const [paramRows, periodRows] = await Promise.all([
    fetchParameterRows(pool, { includeArchived: false }),
    fetchPeriodRows(pool, { includeArchived: true }),
  ]);
  const roots = buildParameterTree(paramRows);
  const leaves = new Set(leafIds(roots));

  const scope = studentId !== undefined ? 'student_id = $2' : 'student_id IS NULL';
  const values = studentId !== undefined ? [groupId, studentId] : [groupId];
  const cellRows = await pool.query(
    `SELECT parameter_id AS "parameterId",
            period_id    AS "periodId",
            value::float8 AS value
       FROM evaluations
      WHERE group_id = $1 AND ${scope} AND value IS NOT NULL`,
    values
  );

  // Leaf value map per period, then roll up each period independently.
  const leafByPeriod = new Map();
  for (const row of cellRows.rows) {
    if (!leaves.has(row.parameterId)) continue;
    if (!leafByPeriod.has(row.periodId)) leafByPeriod.set(row.periodId, new Map());
    leafByPeriod.get(row.periodId).set(row.parameterId, row.value);
  }

  const series = [];
  for (const [periodId, valueByLeaf] of leafByPeriod) {
    const rolled = rollupValues(roots, valueByLeaf);
    for (const [parameterId, value] of rolled) {
      if (value !== null) series.push({ parameterId, periodId, value });
    }
  }

  const periods = periodRows
    .filter((p) => leafByPeriod.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, startDate: p.startDate, endDate: p.endDate }));

  const parameters = flattenForest(roots).map((node) => ({
    id: node.id,
    parentId: node.parentId ?? null,
    name: node.name,
    unit: node.unit,
    depth: node.depth,
    isLeaf: node.isLeaf,
    effective: node.effective,
  }));

  res.json({
    mode: studentId !== undefined ? 'student' : 'group',
    group: { id: group.id, name: group.name },
    parameters,
    periods,
    series,
  });
});

// Headline counts for the main dashboard.
router.get('/summary', async (_req, res) => {
  const result = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM students WHERE deleted_at IS NULL)        AS "students",
       (SELECT count(*)::int FROM student_groups WHERE archived_at IS NULL) AS "groups",
       (SELECT count(*)::int FROM parameters WHERE archived_at IS NULL)     AS "parameters",
       (SELECT count(*)::int FROM periods WHERE archived_at IS NULL)        AS "periods",
       (SELECT count(*)::int FROM tasks)                                    AS "tasks",
       (SELECT count(*)::int FROM evaluations WHERE value IS NOT NULL)      AS "scores"`
  );
  res.json({ summary: result.rows[0] });
});

export default router;
