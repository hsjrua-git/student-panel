import { Router } from 'express';
import pool from '../db/pool.js';
import { descendantGroupIds } from '../lib/groups.js';
import { isUuid } from '../lib/ids.js';

const router = Router();

router.get('/trends', async (req, res) => {
  const { groupId } = req.query;
  if (groupId !== undefined && !isUuid(groupId)) {
    return res.status(400).json({ error: 'groupId must be a valid ID.' });
  }

  let groupJoin = '';
  const values = [];
  if (groupId !== undefined) {
    const groupIds = await descendantGroupIds(pool, groupId);
    values.push(groupIds);
    groupJoin = `JOIN student_group_members m
                   ON m.student_id = s.id AND m.group_id = ANY($1::uuid[])`;
  }

  const result = await pool.query(
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
    values
  );
  res.json({ trends: result.rows });
});

export default router;
