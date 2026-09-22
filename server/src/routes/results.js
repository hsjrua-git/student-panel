import { Router } from 'express';
import pool from '../db/pool.js';
import {
  MAX_PERIOD,
  isValidPeriodNumber,
  parametersUsedInPeriod,
} from '../lib/parameterUse.js';
import { periodDates, periodForDate, todayIso } from '../lib/periods.js';
import { MAX_RESULT_STUDENTS, buildResults } from '../lib/results.js';
import { descendantGroupIds } from '../lib/groups.js';
import { isUuid } from '../lib/ids.js';

const router = Router();

router.get('/', async (req, res) => {
  const raw = req.query.periodNumber;
  const isDigits = typeof raw === 'string' && /^\d+$/.test(raw);
  if (!isDigits || !isValidPeriodNumber(Number(raw))) {
    return res.status(400).json({
      error: `periodNumber must be a whole number from 1 to ${MAX_PERIOD}.`,
    });
  }
  const periodNumber = Number(raw);

  const { groupId } = req.query;
  if (groupId !== undefined && !isUuid(groupId)) {
    return res.status(400).json({ error: 'groupId must be a valid ID.' });
  }
  // Build an optional "student belongs to this group tree" SQL condition.
  let groupFilter = '';
  const groupValues = [];
  if (groupId !== undefined) {
    const groupIds = await descendantGroupIds(pool, groupId);
    groupValues.push(groupIds);
    groupFilter = ` AND id IN (SELECT student_id FROM student_group_members
                    WHERE group_id = ANY($1::uuid[]))`;
  }

  const anchorResult = await pool.query(
    'SELECT value FROM settings WHERE key = $1',
    ['period_anchor_date']
  );
  const anchorDate = anchorResult.rows[0]?.value;
  if (!anchorDate) {
    return res.status(409).json({ error: 'Set the period start date first.' });
  }

  const current = periodForDate(anchorDate, todayIso());
  if (current === null || periodNumber > current) {
    return res
      .status(400)
      .json({ error: `Period ${periodNumber} has not started yet.` });
  }

  const [
    changesResult,
    parametersResult,
    studentsResult,
    countResult,
    evaluationsResult,
  ] = await Promise.all([
    pool.query(
      `SELECT parameter_id  AS "parameterId",
              period_number AS "periodNumber",
              scope,
              action
       FROM parameter_changes`
    ),
    pool.query(
      `SELECT id,
              name,
              unit,
              min_value::float8 AS "minValue",
              max_value::float8 AS "maxValue"
       FROM parameters
       ORDER BY sort_order, lower(name)`
    ),
    pool.query(
      `SELECT id,
              full_name    AS "fullName",
              student_code AS "studentCode"
       FROM students
       WHERE deleted_at IS NULL${groupFilter}
       ORDER BY lower(full_name), id
       LIMIT $${groupValues.length + 1}`,
      [...groupValues, MAX_RESULT_STUDENTS]
    ),
    pool.query(
      `SELECT count(*)::int AS total FROM students
       WHERE deleted_at IS NULL${groupFilter}`,
      groupValues
    ),
    pool.query(
      `SELECT student_id    AS "studentId",
              parameter_id  AS "parameterId",
              period_number AS "periodNumber",
              value::float8 AS value
       FROM evaluations
       WHERE period_number = ANY($1::int[]) AND value IS NOT NULL`,
      [[periodNumber, periodNumber - 1]]
    ),
  ]);

  const usedIds = new Set(
    parametersUsedInPeriod(changesResult.rows, periodNumber)
  );
  const built = buildResults({
    periodNumber,
    parameters: parametersResult.rows,
    usedIds,
    students: studentsResult.rows,
    evaluations: evaluationsResult.rows,
  });
  const dates = periodDates(anchorDate, periodNumber);
  const total = countResult.rows[0].total;

  res.json({
    periodNumber,
    startDate: dates.startDate,
    endDate: dates.endDate,
    ...built,
    total,
    truncated: total > studentsResult.rows.length,
  });
});

export default router;