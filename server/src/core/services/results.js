// Results (per-period roll-up) — service layer (framework-free).
//
// On-device equivalent of routes/results.js: a single read that assembles one
// period's scores into the table the Results page renders. No audit, no
// req.user (it was a pure GET), so the conversion is just pool→getDb(), status
// codes→ServiceError, and query-string coercion done explicitly.
//
// `input` = { periodNumber, groupId? }. Returns
// { periodNumber, startDate, endDate, ...buildResults(...), total, truncated }.

import { getDb } from '../db.js';
import { ServiceError } from '../errors.js';
import {
  MAX_PERIOD,
  isValidPeriodNumber,
  parametersUsedInPeriod,
} from '../../lib/parameterUse.js';
import { periodDates, periodForDate, todayIso } from '../../lib/periods.js';
import { MAX_RESULT_STUDENTS, buildResults } from '../../lib/results.js';
import { descendantGroupIds } from '../../lib/groups.js';
import { isUuid } from '../../lib/ids.js';

const PERIOD_MESSAGE = `must be a whole number from 1 to ${MAX_PERIOD}.`;

export async function getResults(input = {}) {
  const db = getDb();
  const { periodNumber: rawPeriod, groupId } = input;

  const periodNumber = Number(rawPeriod);
  if (!Number.isInteger(periodNumber) || !isValidPeriodNumber(periodNumber)) {
    throw ServiceError.validation(`periodNumber ${PERIOD_MESSAGE}`);
  }
  if (groupId !== undefined && !isUuid(groupId)) {
    throw ServiceError.validation('groupId must be a valid ID.');
  }

  // Optional "student belongs to this group tree" SQL condition.
  let groupFilter = '';
  const groupValues = [];
  if (groupId !== undefined) {
    const groupIds = await descendantGroupIds(db, groupId);
    groupValues.push(groupIds);
    groupFilter = ` AND id IN (SELECT student_id FROM student_group_members
                    WHERE group_id = ANY($1::uuid[]))`;
  }

  const anchorResult = await db.query(
    'SELECT value FROM settings WHERE key = $1',
    ['period_anchor_date'],
  );
  const anchorDate = anchorResult.rows[0]?.value;
  if (!anchorDate) {
    throw ServiceError.conflict('Set the period start date first.');
  }

  const current = periodForDate(anchorDate, todayIso());
  if (current === null || periodNumber > current) {
    throw ServiceError.validation(`Period ${periodNumber} has not started yet.`);
  }

  const [
    changesResult,
    parametersResult,
    studentsResult,
    countResult,
    evaluationsResult,
  ] = await Promise.all([
    db.query(
      `SELECT parameter_id  AS "parameterId",
              period_number AS "periodNumber",
              scope,
              action
       FROM parameter_changes`,
    ),
    db.query(
      `SELECT id,
              name,
              unit,
              min_value::float8 AS "minValue",
              max_value::float8 AS "maxValue"
       FROM parameters
       ORDER BY sort_order, lower(name)`,
    ),
    db.query(
      `SELECT id,
              full_name    AS "fullName",
              student_code AS "studentCode"
       FROM students
       WHERE deleted_at IS NULL${groupFilter}
       ORDER BY lower(full_name), id
       LIMIT $${groupValues.length + 1}`,
      [...groupValues, MAX_RESULT_STUDENTS],
    ),
    db.query(
      `SELECT count(*)::int AS total FROM students
       WHERE deleted_at IS NULL${groupFilter}`,
      groupValues,
    ),
    db.query(
      `SELECT student_id    AS "studentId",
              parameter_id  AS "parameterId",
              period_number AS "periodNumber",
              value::float8 AS value
       FROM evaluations
       WHERE period_number = ANY($1::int[]) AND value IS NOT NULL`,
      [[periodNumber, periodNumber - 1]],
    ),
  ]);

  const usedIds = new Set(
    parametersUsedInPeriod(changesResult.rows, periodNumber),
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

  return {
    periodNumber,
    startDate: dates.startDate,
    endDate: dates.endDate,
    ...built,
    total,
    truncated: total > studentsResult.rows.length,
  };
}
