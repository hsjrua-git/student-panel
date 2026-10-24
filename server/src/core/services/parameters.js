// Parameters and their period-scoped changes — service layer (framework-free).
//
// On-device equivalent of routes/parameters.js. Plain args in, plain data out,
// ServiceError instead of status codes, getDb() for the pool. This route never
// touched req.user or the audit log, so the conversion is purely: pool ->
// getDb(), res.status(...) -> ServiceError, and the router.param uuid/number
// guards -> inline checks (a bad id reads as NOT_FOUND, a bad period as
// VALIDATION, exactly as the route's 404 / 400 did).
//
// The pure helpers in lib/parameterUse.js (period math, hiddenScores) and the
// validation/parameter.js parser are reused unchanged.

import { getDb } from '../db.js';
import { ServiceError } from '../errors.js';
import { parseParameterInput } from '../../validation/parameter.js';
import {
  MAX_PERIOD,
  hiddenScores,
  isValidPeriodNumber,
  parametersUsedInPeriod,
} from '../../lib/parameterUse.js';
import { isUuid } from '../../lib/ids.js';

const SCOPES = ['from_here_on', 'this_period_only'];
const ACTIONS = ['add', 'remove'];

const PARAMETER_COLUMNS = `
  id,
  name,
  unit,
  min_value::float8 AS "minValue",
  max_value::float8 AS "maxValue",
  sort_order        AS "sortOrder"
`;

const CHANGE_COLUMNS = `
  id,
  parameter_id  AS "parameterId",
  period_number AS "periodNumber",
  scope,
  action,
  created_at    AS "createdAt"
`;

// Map the two DB constraint violations the route special-cased to ServiceError.
function mapParameterError(err) {
  if (err && err.code === '23505') {
    return ServiceError.conflict('A parameter with that name already exists.');
  }
  if (err && err.code === '23514') {
    return ServiceError.validation('The minimum cannot be larger than the maximum.');
  }
  return null;
}

const PERIOD_MESSAGE = `must be a whole number from 1 to ${MAX_PERIOD}.`;

export async function listParameters() {
  const db = getDb();
  const result = await db.query(
    `SELECT ${PARAMETER_COLUMNS}
     FROM parameters
     ORDER BY sort_order, lower(name)`,
  );
  return { parameters: result.rows };
}

// Create a parameter and seed a 'from_here_on'/'add' change at startPeriod.
// `input` = { name, unit?, minValue?, maxValue?, startPeriod }.
export async function createParameter(input = {}) {
  const db = getDb();

  const parsed = parseParameterInput(input);
  if (parsed.error) throw ServiceError.validation(parsed.error);

  const startPeriod = input.startPeriod;
  if (!isValidPeriodNumber(startPeriod)) {
    throw ServiceError.validation(`startPeriod ${PERIOD_MESSAGE}`);
  }

  const { name, unit = null, minValue = null, maxValue = null } = parsed.values;

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO parameters (name, unit, min_value, max_value, sort_order)
       VALUES ($1, $2, $3, $4,
               (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM parameters))
       RETURNING ${PARAMETER_COLUMNS}`,
      [name, unit, minValue, maxValue],
    );
    await client.query(
      `INSERT INTO parameter_changes (parameter_id, period_number, scope, action)
       VALUES ($1, $2, 'from_here_on', 'add')`,
      [created.rows[0].id, startPeriod],
    );
    await client.query('COMMIT');
    return created.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const mapped = mapParameterError(err);
    if (mapped) throw mapped;
    throw err;
  } finally {
    client.release();
  }
}

// Update a parameter. `changes` may include name/unit/minValue/maxValue/sortOrder.
// The min/max range cannot change once any score exists for the parameter.
export async function updateParameter(id, changes = {}) {
  const db = getDb();
  if (!isUuid(id)) throw ServiceError.notFound('Not found.');

  const parsed = parseParameterInput(changes, { partial: true });
  if (parsed.error) throw ServiceError.validation(parsed.error);

  const columns = {
    name: 'name',
    unit: 'unit',
    minValue: 'min_value',
    maxValue: 'max_value',
    sortOrder: 'sort_order',
  };
  const entries = Object.entries(parsed.values);
  if (entries.length === 0) {
    throw ServiceError.validation('Nothing to change.');
  }

  if ('minValue' in parsed.values || 'maxValue' in parsed.values) {
    const currentResult = await db.query(
      `SELECT min_value::float8 AS "minValue", max_value::float8 AS "maxValue"
       FROM parameters WHERE id = $1`,
      [id],
    );
    if (currentResult.rowCount === 0) {
      throw ServiceError.notFound('Parameter not found.');
    }
    const row = currentResult.rows[0];
    const rangeChanges =
      ('minValue' in parsed.values && parsed.values.minValue !== row.minValue) ||
      ('maxValue' in parsed.values && parsed.values.maxValue !== row.maxValue);

    if (rangeChanges) {
      const scores = await db.query(
        'SELECT 1 FROM evaluations WHERE parameter_id = $1 LIMIT 1',
        [id],
      );
      if (scores.rowCount > 0) {
        throw ServiceError.conflict(
          'The range cannot be changed after scores exist for this parameter.',
        );
      }
    }
  }

  const assignments = entries.map(
    ([key], index) => `${columns[key]} = $${index + 1}`,
  );
  const values = entries.map(([, value]) => value);

  try {
    const result = await db.query(
      `UPDATE parameters
       SET ${assignments.join(', ')}
       WHERE id = $${values.length + 1}
       RETURNING ${PARAMETER_COLUMNS}`,
      [...values, id],
    );
    if (result.rowCount === 0) {
      throw ServiceError.notFound('Parameter not found.');
    }
    return result.rows[0];
  } catch (err) {
    const mapped = mapParameterError(err);
    if (mapped) throw mapped;
    throw err;
  }
}

// List every parameter change, joined to its parameter name.
export async function listParameterChanges() {
  const db = getDb();
  const result = await db.query(
    `SELECT c.id,
            c.parameter_id  AS "parameterId",
            p.name          AS "parameterName",
            c.period_number AS "periodNumber",
            c.scope,
            c.action,
            c.created_at    AS "createdAt"
     FROM parameter_changes c
     JOIN parameters p ON p.id = c.parameter_id
     ORDER BY c.period_number, p.sort_order, c.scope`,
  );
  return { changes: result.rows };
}

// Preview which existing scores a proposed change would hide (never writes).
// `input` = { parameterId, periodNumber, scope, action }. periodNumber may be a
// number or a digit string (the route received it as a query param).
export async function parameterChangeImpact(input = {}) {
  const db = getDb();
  const { parameterId, scope, action } = input;

  if (!isUuid(parameterId)) {
    throw ServiceError.validation('parameterId must be a valid ID.');
  }
  const periodNumber = Number(input.periodNumber);
  const isWholeNumber =
    Number.isInteger(periodNumber) && isValidPeriodNumber(periodNumber);
  if (!isWholeNumber) {
    throw ServiceError.validation(`periodNumber ${PERIOD_MESSAGE}`);
  }
  if (!SCOPES.includes(scope)) {
    throw ServiceError.validation(`scope must be one of: ${SCOPES.join(', ')}.`);
  }
  if (!ACTIONS.includes(action)) {
    throw ServiceError.validation(`action must be one of: ${ACTIONS.join(', ')}.`);
  }

  const [changesResult, countsResult] = await Promise.all([
    db.query(
      `SELECT parameter_id  AS "parameterId",
              period_number AS "periodNumber",
              scope,
              action
       FROM parameter_changes
       WHERE parameter_id = $1`,
      [parameterId],
    ),
    db.query(
      `SELECT period_number AS "periodNumber", count(*)::int AS count
       FROM evaluations
       WHERE parameter_id = $1 AND value IS NOT NULL
       GROUP BY period_number
       ORDER BY period_number`,
      [parameterId],
    ),
  ]);

  return hiddenScores({
    changes: changesResult.rows,
    change: { parameterId, periodNumber, scope, action },
    scoreCounts: countsResult.rows,
  });
}

// Create or replace a parameter change at (parameterId, periodNumber, scope).
// `input` = { parameterId, periodNumber, scope, action }. A missing parameter
// (FK violation) reads as NOT_FOUND, matching the route's 404.
export async function upsertParameterChange(input = {}) {
  const db = getDb();
  const { parameterId, periodNumber, scope, action } = input;

  if (!isUuid(parameterId)) {
    throw ServiceError.validation('parameterId must be a valid ID.');
  }
  if (!isValidPeriodNumber(periodNumber)) {
    throw ServiceError.validation(`periodNumber ${PERIOD_MESSAGE}`);
  }
  if (!SCOPES.includes(scope)) {
    throw ServiceError.validation(`scope must be one of: ${SCOPES.join(', ')}.`);
  }
  if (!ACTIONS.includes(action)) {
    throw ServiceError.validation(`action must be one of: ${ACTIONS.join(', ')}.`);
  }

  try {
    const result = await db.query(
      `INSERT INTO parameter_changes (parameter_id, period_number, scope, action)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (parameter_id, period_number, scope)
       DO UPDATE SET action = EXCLUDED.action, created_at = now()
       RETURNING ${CHANGE_COLUMNS}`,
      [parameterId, periodNumber, scope, action],
    );
    return result.rows[0];
  } catch (err) {
    if (err && err.code === '23503') {
      throw ServiceError.notFound('Parameter not found.');
    }
    throw err;
  }
}

// Delete a parameter change by id. A bad uuid, or none deleted, reads as
// NOT_FOUND (the route's router.param uuid guard produced a 404 too).
export async function deleteParameterChange(id) {
  const db = getDb();
  if (!isUuid(id)) throw ServiceError.notFound('Not found.');

  const result = await db.query(
    'DELETE FROM parameter_changes WHERE id = $1',
    [id],
  );
  if (result.rowCount === 0) {
    throw ServiceError.notFound('Change not found.');
  }
}

// The parameters active in a given period, in display order. A bad period reads
// as VALIDATION, matching the route's router.param('number') 400.
export async function parametersForPeriod(number) {
  const db = getDb();
  const periodNumber = Number(number);
  if (!Number.isInteger(periodNumber) || !isValidPeriodNumber(periodNumber)) {
    throw ServiceError.validation(`Period ${PERIOD_MESSAGE}`);
  }

  const [changesResult, parametersResult] = await Promise.all([
    db.query(
      `SELECT parameter_id  AS "parameterId",
              period_number AS "periodNumber",
              scope,
              action
       FROM parameter_changes`,
    ),
    db.query(
      `SELECT ${PARAMETER_COLUMNS}
       FROM parameters
       ORDER BY sort_order, lower(name)`,
    ),
  ]);

  const usedIds = new Set(
    parametersUsedInPeriod(changesResult.rows, periodNumber),
  );
  return {
    periodNumber,
    parameters: parametersResult.rows.filter((parameter) =>
      usedIds.has(parameter.id),
    ),
  };
}

