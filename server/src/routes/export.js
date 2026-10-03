import { Router } from 'express';
import pool from '../db/pool.js';
import { MAX_PERIOD, isValidPeriodNumber } from '../lib/parameterUse.js';
import { periodDates, periodForDate, todayIso } from '../lib/periods.js';
import { descendantGroupIds } from '../lib/groups.js';
import { isUuid } from '../lib/ids.js';
import { MAX_EXPORT_STUDENTS, buildCube } from '../lib/exportCube.js';

const router = Router();

// Guard against an absurd number of ids in one request (the arrays are passed
// straight into `= ANY($n::uuid[])`, so this bounds the query too).
const MAX_IDS = 5000;

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

// The cube: any student × parameter × period slice in one request. Both GET
// (comma-separated ids in the query string) and POST (id arrays in the body,
// for selections too large for a URL) run this. Note: custom student fields are
// deliberately NOT part of the scores cube — the roster export on the Students
// page already covers those, and leaving them out keeps this route clear of the
// `fields.view_restricted` gate.
async function handleCube(req, res) {
  const source = req.method === 'POST' ? req.body ?? {} : req.query;

  const { groupId } = source;
  if (groupId !== undefined && !isUuid(groupId)) {
    return res.status(400).json({ error: 'groupId must be a valid ID.' });
  }

  const studentIds = normalizeList(source.studentIds);
  if (studentIds.length > MAX_IDS) {
    return res.status(400).json({ error: `Too many students requested (max ${MAX_IDS}).` });
  }
  if (studentIds.some((id) => !isUuid(id))) {
    return res.status(400).json({ error: 'studentIds must all be valid IDs.' });
  }

  const parameterIds = normalizeList(source.parameterIds);
  if (parameterIds.length > MAX_IDS) {
    return res.status(400).json({ error: `Too many parameters requested (max ${MAX_IDS}).` });
  }
  if (parameterIds.some((id) => !isUuid(id))) {
    return res.status(400).json({ error: 'parameterIds must all be valid IDs.' });
  }
  const selectedParameterIds = parameterIds.length > 0 ? parameterIds : null;

  const anchorResult = await pool.query(
    'SELECT value FROM settings WHERE key = $1',
    ['period_anchor_date']
  );
  const anchorDate = anchorResult.rows[0]?.value;
  if (!anchorDate) {
    return res.status(409).json({ error: 'Set the period start date first.' });
  }
  const current = periodForDate(anchorDate, todayIso());
  if (!current) {
    return res.status(400).json({ error: 'No periods have started yet.' });
  }

  // Requested periods: an explicit list, or "all" (1..current) when omitted or
  // the literal string "all". Every listed period must exist and have started.
  const periodsRaw = source.periods;
  let periods;
  if (periodsRaw === undefined || periodsRaw === 'all') {
    periods = Array.from({ length: current }, (_, index) => index + 1);
  } else {
    const list = normalizeList(periodsRaw);
    const numbers = [];
    for (const value of list) {
      if (!/^\d+$/.test(value) || !isValidPeriodNumber(Number(value))) {
        return res.status(400).json({
          error: `Each period must be a whole number from 1 to ${MAX_PERIOD}.`,
        });
      }
      numbers.push(Number(value));
    }
    if (numbers.length === 0) {
      return res.status(400).json({ error: 'Select at least one period.' });
    }
    const tooNew = numbers.find((number) => number > current);
    if (tooNew !== undefined) {
      return res.status(400).json({ error: `Period ${tooNew} has not started yet.` });
    }
    periods = [...new Set(numbers)].sort((a, b) => a - b);
  }

  // Build the roster filter. A specific selection wins over a group; otherwise
  // the whole (non-deleted) roster, bounded by the export cap.
  const filters = [];
  const values = [];
  if (studentIds.length > 0) {
    values.push(studentIds);
    filters.push(`id = ANY($${values.length}::uuid[])`);
  } else if (groupId !== undefined) {
    const groupIds = await descendantGroupIds(pool, groupId);
    values.push(groupIds);
    filters.push(
      `id IN (SELECT student_id FROM student_group_members
              WHERE group_id = ANY($${values.length}::uuid[]))`
    );
  }
  const where = ['deleted_at IS NULL', ...filters].join(' AND ');

  const [studentsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id,
              full_name    AS "fullName",
              student_code AS "studentCode"
       FROM students
       WHERE ${where}
       ORDER BY lower(full_name), id
       LIMIT $${values.length + 1}`,
      [...values, MAX_EXPORT_STUDENTS]
    ),
    pool.query(
      `SELECT count(*)::int AS total FROM students WHERE ${where}`,
      values
    ),
  ]);

  const rosterIds = studentsResult.rows.map((student) => student.id);

  // Fetch scored cells for the requested periods AND each period − 1 (for the
  // client's "change vs previous" deltas), scoped to the roster (and the
  // selected parameters, when pinned) to keep the result bounded.
  const periodsUnion = new Set();
  for (const number of periods) {
    periodsUnion.add(number);
    if (number - 1 >= 1) periodsUnion.add(number - 1);
  }

  const evalValues = [rosterIds, [...periodsUnion]];
  let evalParamFilter = '';
  if (selectedParameterIds) {
    evalValues.push(selectedParameterIds);
    evalParamFilter = ` AND parameter_id = ANY($${evalValues.length}::uuid[])`;
  }

  const [changesResult, parametersResult, evaluationsResult] = await Promise.all([
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
      `SELECT student_id    AS "studentId",
              parameter_id  AS "parameterId",
              period_number AS "periodNumber",
              value::float8 AS value
       FROM evaluations
       WHERE student_id = ANY($1::uuid[])
         AND period_number = ANY($2::int[])
         AND value IS NOT NULL${evalParamFilter}`,
      evalValues
    ),
  ]);

  const cube = buildCube({
    periods,
    parameters: parametersResult.rows,
    changes: changesResult.rows,
    students: studentsResult.rows,
    evaluations: evaluationsResult.rows,
    selectedParameterIds,
    periodDatesFor: (number) => {
      const dates = periodDates(anchorDate, number);
      return { startDate: dates.startDate, endDate: dates.endDate };
    },
  });

  const total = countResult.rows[0].total;
  res.json({
    anchorDate,
    current,
    ...cube,
    total,
    truncated: total > rosterIds.length,
  });
}

router.get('/cube', handleCube);
router.post('/cube', handleCube);

export default router;
