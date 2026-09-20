import { Router } from 'express';
import pool from '../db/pool.js';
import {
  isSaturday,
  isValidIsoDate,
  periodDates,
  periodForDate,
  todayIso,
} from '../lib/periods.js';
import { parametersUsedInPeriod } from '../lib/parameterUse.js';

const router = Router();
const ANCHOR_KEY = 'period_anchor_date';

async function readAnchor() {
  const result = await pool.query(
    'SELECT value FROM settings WHERE key = $1',
    [ANCHOR_KEY]
  );
  return result.rows[0]?.value ?? null;
}

router.get('/settings/period-anchor', async (req, res) => {
  res.json({ anchorDate: await readAnchor() });
});

router.put('/settings/period-anchor', async (req, res) => {
  const anchorDate = req.body?.anchorDate;
  if (!isValidIsoDate(anchorDate)) {
    return res
      .status(400)
      .json({ error: 'anchorDate must be a real date written as YYYY-MM-DD.' });
  }
  if (!isSaturday(anchorDate)) {
    return res.status(400).json({ error: 'The anchor date must be a Saturday.' });
  }

  if ((await readAnchor()) !== anchorDate) {
    const scores = await pool.query('SELECT 1 FROM evaluations LIMIT 1');
    if (scores.rowCount > 0) {
      return res.status(409).json({
        error: 'The anchor date cannot be changed after scores exist.',
      });
    }
  }

  await pool.query(
    `INSERT INTO settings (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = now()`,
    [ANCHOR_KEY, anchorDate]
  );
  res.json({ anchorDate });
});

router.get('/periods', async (req, res) => {
  const today = todayIso();
  const anchorDate = await readAnchor();
  if (!anchorDate) {
    return res.json({ anchorDate: null, today, current: null, periods: [] });
  }

  const changesResult = await pool.query(
    `SELECT parameter_id  AS "parameterId",
            period_number AS "periodNumber",
            scope,
            action
     FROM parameter_changes`
  );

  const current = periodForDate(anchorDate, today);
  const periods = [];
  for (let number = 1; number <= (current ?? 0); number++) {
    periods.push({
      ...periodDates(anchorDate, number),
      parameterIds: parametersUsedInPeriod(changesResult.rows, number),
    });
  }
  res.json({ anchorDate, today, current, periods });
});

export default router;