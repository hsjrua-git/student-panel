import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

router.get('/trends', async (req, res) => {
  const result = await pool.query(
    `SELECT e.parameter_id  AS "parameterId",
            e.period_number AS "periodNumber",
            round(avg(e.value), 2)::float8 AS average,
            count(*)::int   AS count
     FROM evaluations e
     JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
     WHERE e.value IS NOT NULL
     GROUP BY e.parameter_id, e.period_number
     ORDER BY e.parameter_id, e.period_number`
  );
  res.json({ trends: result.rows });
});

export default router;