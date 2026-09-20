import { Router } from 'express';
import pool from '../db/pool.js';
import { isUuid } from '../lib/ids.js';
import { periodForDate, todayIso } from '../lib/periods.js';
import {
  MAX_PERIOD,
  isValidPeriodNumber,
  parametersUsedInPeriod,
} from '../lib/parameterUse.js';
import { findProblems, validateShape } from '../lib/evaluationCheck.js';

const router = Router();

router.get('/evaluations', async (req, res) => {
  const { studentId, parameterId, periodNumber } = req.query;
  const conditions = ['value IS NOT NULL'];
  const values = [];

  if (studentId !== undefined) {
    if (!isUuid(studentId)) {
      return res.status(400).json({ error: 'studentId must be a valid ID.' });
    }
    values.push(studentId);
    conditions.push(`student_id = $${values.length}`);
  }
  if (parameterId !== undefined) {
    if (!isUuid(parameterId)) {
      return res.status(400).json({ error: 'parameterId must be a valid ID.' });
    }
    values.push(parameterId);
    conditions.push(`parameter_id = $${values.length}`);
  }
  if (periodNumber !== undefined) {
    const isDigits =
      typeof periodNumber === 'string' && /^\d+$/.test(periodNumber);
    if (!isDigits || !isValidPeriodNumber(Number(periodNumber))) {
      return res.status(400).json({
        error: `periodNumber must be a whole number from 1 to ${MAX_PERIOD}.`,
      });
    }
    values.push(Number(periodNumber));
    conditions.push(`period_number = $${values.length}`);
  }

  if (values.length === 0) {
    return res.status(400).json({
      error: 'Add at least one filter: studentId, parameterId or periodNumber.',
    });
  }

  const result = await pool.query(
    `SELECT student_id    AS "studentId",
            parameter_id  AS "parameterId",
            period_number AS "periodNumber",
            value::float8 AS value,
            updated_at    AS "updatedAt"
     FROM evaluations
     WHERE ${conditions.join(' AND ')}
     ORDER BY period_number, student_id, parameter_id
     LIMIT 20000`,
    values
  );
  res.json({ evaluations: result.rows });
});

router.put('/evaluations/bulk', async (req, res) => {
  const { periodNumber, entries } = req.body ?? {};

  if (!isValidPeriodNumber(periodNumber)) {
    return res.status(400).json({
      error: `periodNumber must be a whole number from 1 to ${MAX_PERIOD}.`,
    });
  }
  const shapeError = validateShape(entries);
  if (shapeError) {
    return res.status(400).json({ error: shapeError });
  }

  const anchorResult = await pool.query(
    'SELECT value FROM settings WHERE key = $1',
    ['period_anchor_date']
  );
  const anchorDate = anchorResult.rows[0]?.value;
  if (!anchorDate) {
    return res.status(409).json({ error: 'Set the period anchor date first.' });
  }

  const current = periodForDate(anchorDate, todayIso());
  if (current === null) {
    return res.status(409).json({ error: 'Period 1 has not started yet.' });
  }
  if (periodNumber > current) {
    return res.status(400).json({
      error: `Period ${periodNumber} has not started yet. The current period is ${current}.`,
    });
  }

  const studentIds = [...new Set(entries.map((entry) => entry.studentId))];
  const [changesResult, parametersResult, studentsResult] = await Promise.all([
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
              min_value::float8 AS "minValue",
              max_value::float8 AS "maxValue"
       FROM parameters`
    ),
    pool.query(
      `SELECT id FROM students
       WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [studentIds]
    ),
  ]);

  const usedIds = new Set(
    parametersUsedInPeriod(changesResult.rows, periodNumber)
  );
  const usedParameters = new Map(
    parametersResult.rows
      .filter((parameter) => usedIds.has(parameter.id))
      .map((parameter) => [parameter.id, parameter])
  );
  const knownStudentIds = new Set(studentsResult.rows.map((row) => row.id));

  const problems = findProblems({
    entries,
    usedParameters,
    knownStudentIds,
    periodNumber,
  });
  if (problems.length > 0) {
    return res.status(400).json({
      error: 'Some entries are invalid. Nothing was saved.',
      problems,
    });
  }

  let changed = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const entry of entries) {
      const result =
        entry.value === null
          ? await client.query(
              `UPDATE evaluations
               SET value = NULL, updated_at = now()
               WHERE student_id = $1 AND parameter_id = $2
                 AND period_number = $3 AND value IS NOT NULL`,
              [entry.studentId, entry.parameterId, periodNumber]
            )
          : await client.query(
              `INSERT INTO evaluations
                 (student_id, parameter_id, period_number, value)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (student_id, parameter_id, period_number)
               DO UPDATE SET value = EXCLUDED.value, updated_at = now()
               WHERE evaluations.value IS DISTINCT FROM EXCLUDED.value`,
              [entry.studentId, entry.parameterId, periodNumber, entry.value]
            );
      changed += result.rowCount;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json({ periodNumber, changed });
});

export default router;