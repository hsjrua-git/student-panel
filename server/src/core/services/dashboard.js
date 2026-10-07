// Dashboard trends — service layer (framework-free).
//
// On-device equivalent of routes/dashboard.js: one read that averages every
// stored score by (parameter, period) for the trend charts, optionally scoped
// to a group subtree. Pure GET → just pool→getDb() and a ServiceError guard.
//
// `input` = { groupId? }. Returns { trends: [{ parameterId, periodNumber,
// average, count }] }.

import { getDb } from '../db.js';
import { ServiceError } from '../errors.js';
import { descendantGroupIds } from '../../lib/groups.js';
import { isUuid } from '../../lib/ids.js';

export async function getTrends(input = {}) {
  const db = getDb();
  const { groupId } = input;
  if (groupId !== undefined && !isUuid(groupId)) {
    throw ServiceError.validation('groupId must be a valid ID.');
  }

  let groupJoin = '';
  const values = [];
  if (groupId !== undefined) {
    const groupIds = await descendantGroupIds(db, groupId);
    values.push(groupIds);
    groupJoin = `JOIN student_group_members m
                   ON m.student_id = s.id AND m.group_id = ANY($1::uuid[])`;
  }

  const result = await db.query(
    `SELECT e.parameter_id  AS "parameterId",
            e.period_number AS "periodNumber",
            round(avg(e.value), 2)::float8 AS average,
            count(*)::int   AS count
     FROM evaluations e
     JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
     ${groupJoin}
     WHERE e.value IS NOT NULL
     GROUP BY e.parameter_id, e.period_number
     ORDER BY e.parameter_id, e.period_number`,
    values,
  );
  return { trends: result.rows };
}
