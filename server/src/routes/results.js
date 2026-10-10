import { Router } from 'express';
import pool from '../db/pool.js';
import { isUuid } from '../lib/ids.js';
import {
  fetchParameterRows,
  buildParameterTree,
  leafIds,
} from '../lib/parameters.js';
import { fetchGroupRows, fetchDirectMembers } from '../lib/groups.js';
import { fetchPeriod } from '../lib/periods.js';
import { buildGroupResults, buildStudentResults } from '../lib/results.js';

// Read-only results for one group in one period. Every parameter (leaves plus
// derived parents) is returned with its effective range/norm and the rolled-up
// values: the group's own score, and — unless a single studentId is asked for —
// an aggregate (avg/min/max/count) across the group's direct members. All GETs,
// so the audit middleware ignores them.

const router = Router();

router.get('/', async (req, res) => {
  const { groupId, periodId, studentId } = req.query;
  if (!isUuid(groupId)) return res.status(400).json({ error: 'groupId must be a valid ID.' });
  if (!isUuid(periodId)) return res.status(400).json({ error: 'periodId must be a valid ID.' });
  if (studentId !== undefined && !isUuid(studentId)) {
    return res.status(400).json({ error: 'studentId must be a valid ID.' });
  }

  const groupRows = await fetchGroupRows(pool, { includeArchived: true });
  const group = groupRows.find((g) => g.id === groupId);
  if (!group || group.archivedAt) return res.status(404).json({ error: 'Group not found.' });

  const period = await fetchPeriod(pool, periodId);
  if (!period) return res.status(404).json({ error: 'Period not found.' });

  const [paramRows, members] = await Promise.all([
    fetchParameterRows(pool, { includeArchived: false }),
    fetchDirectMembers(pool, groupId),
  ]);
  const roots = buildParameterTree(paramRows);
  const leaves = new Set(leafIds(roots));

  const cellRows = await pool.query(
    `SELECT student_id   AS "studentId",
            parameter_id AS "parameterId",
            value::float8 AS value
       FROM evaluations
      WHERE group_id = $1 AND period_id = $2 AND value IS NOT NULL`,
    [groupId, periodId]
  );

  // Split the scored cells into the group's own values and per-student maps,
  // keeping only live leaf parameters (parents are derived, never stored).
  const ownValueByLeaf = new Map();
  const byStudent = new Map();
  for (const row of cellRows.rows) {
    if (!leaves.has(row.parameterId)) continue;
    if (row.studentId === null) {
      ownValueByLeaf.set(row.parameterId, row.value);
    } else {
      if (!byStudent.has(row.studentId)) byStudent.set(row.studentId, new Map());
      byStudent.get(row.studentId).set(row.parameterId, row.value);
    }
  }

  if (studentId !== undefined) {
    const member = members.find((m) => m.id === studentId);
    if (!member) {
      return res.status(404).json({ error: 'That student is not a member of the group.' });
    }
    return res.json({
      mode: 'student',
      group: { id: group.id, name: group.name },
      period,
      student: { id: member.id, fullName: member.fullName, studentCode: member.studentCode },
      rows: buildStudentResults(roots, byStudent.get(studentId) ?? new Map()),
    });
  }

  const memberMaps = members.map((m) => ({
    studentId: m.id,
    valueByLeaf: byStudent.get(m.id) ?? new Map(),
  }));
  res.json({
    mode: 'group',
    group: { id: group.id, name: group.name },
    period,
    members: members.map((m) => ({
      id: m.id,
      fullName: m.fullName,
      studentCode: m.studentCode,
    })),
    rows: buildGroupResults(roots, { ownValueByLeaf, memberMaps }),
  });
});

export default router;
