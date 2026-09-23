import { Router } from 'express';
import pool from '../db/pool.js';
import { parseParameterInput } from '../validation/parameter.js';
import {
  MAX_PERIOD,
  hiddenScores,
  isValidPeriodNumber,
  parametersUsedInPeriod,
} from '../lib/parameterUse.js';
import { isUuid } from '../lib/ids.js';
import { requirePermission } from '../middleware/auth.js';

const router = Router();

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

router.param('id', (req, res, next, value) => {
  if (!UUID_PATTERN.test(value)) {
    return res.status(404).json({ error: 'Not found.' });
  }
  next();
});

router.param('number', (req, res, next, value) => {
  if (!/^\d+$/.test(value) || !isValidPeriodNumber(Number(value))) {
    return res.status(400).json({
      error: `Period must be a whole number from 1 to ${MAX_PERIOD}.`,
    });
  }
  next();
});

function handleParameterError(err, res) {
  if (err.code === UNIQUE_VIOLATION) {
    res.status(409).json({ error: 'A parameter with that name already exists.' });
    return true;
  }
  if (err.code === CHECK_VIOLATION) {
    res
      .status(400)
      .json({ error: 'The minimum cannot be larger than the maximum.' });
    return true;
  }
  return false;
}

router.get('/parameters', async (req, res) => {
  const result = await pool.query(
    `SELECT ${PARAMETER_COLUMNS}
     FROM parameters
     ORDER BY sort_order, lower(name)`
  );
  res.json({ parameters: result.rows });
});

router.post('/parameters', async (req, res) => {
  const parsed = parseParameterInput(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const startPeriod = req.body?.startPeriod;
  if (!isValidPeriodNumber(startPeriod)) {
    return res.status(400).json({
      error: `startPeriod must be a whole number from 1 to ${MAX_PERIOD}.`,
    });
  }

  const { name, unit = null, minValue = null, maxValue = null } = parsed.values;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO parameters (name, unit, min_value, max_value, sort_order)
       VALUES ($1, $2, $3, $4,
               (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM parameters))
       RETURNING ${PARAMETER_COLUMNS}`,
      [name, unit, minValue, maxValue]
    );
    await client.query(
      `INSERT INTO parameter_changes (parameter_id, period_number, scope, action)
       VALUES ($1, $2, 'from_here_on', 'add')`,
      [created.rows[0].id, startPeriod]
    );
    await client.query('COMMIT');
    res.status(201).json(created.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (handleParameterError(err, res)) return;
    throw err;
  } finally {
    client.release();
  }
});

router.patch('/parameters/:id', async (req, res) => {
  const parsed = parseParameterInput(req.body, { partial: true });
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const columns = {
    name: 'name',
    unit: 'unit',
    minValue: 'min_value',
    maxValue: 'max_value',
    sortOrder: 'sort_order',
  };
  const entries = Object.entries(parsed.values);
  if (entries.length === 0) {
    return res.status(400).json({ error: 'Nothing to change.' });
  }

    if ('minValue' in parsed.values || 'maxValue' in parsed.values) {
    const currentResult = await pool.query(
      `SELECT min_value::float8 AS "minValue", max_value::float8 AS "maxValue"
       FROM parameters WHERE id = $1`,
      [req.params.id]
    );
    if (currentResult.rowCount === 0) {
      return res.status(404).json({ error: 'Parameter not found.' });
    }
    const row = currentResult.rows[0];
    const rangeChanges =
      ('minValue' in parsed.values && parsed.values.minValue !== row.minValue) ||
      ('maxValue' in parsed.values && parsed.values.maxValue !== row.maxValue);

    if (rangeChanges) {
      const scores = await pool.query(
        'SELECT 1 FROM evaluations WHERE parameter_id = $1 LIMIT 1',
        [req.params.id]
      );
      if (scores.rowCount > 0) {
        return res.status(409).json({
          error: 'The range cannot be changed after scores exist for this parameter.',
        });
      }
    }
  }

  const assignments = entries.map(
    ([key], index) => `${columns[key]} = $${index + 1}`
  );
  const values = entries.map(([, value]) => value);

  try {
    const result = await pool.query(
      `UPDATE parameters
       SET ${assignments.join(', ')}
       WHERE id = $${values.length + 1}
       RETURNING ${PARAMETER_COLUMNS}`,
      [...values, req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Parameter not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (handleParameterError(err, res)) return;
    throw err;
  }
});

router.get('/parameter-changes', async (req, res) => {
  const result = await pool.query(
    `SELECT c.id,
            c.parameter_id  AS "parameterId",
            p.name          AS "parameterName",
            c.period_number AS "periodNumber",
            c.scope,
            c.action,
            c.created_at    AS "createdAt"
     FROM parameter_changes c
     JOIN parameters p ON p.id = c.parameter_id
     ORDER BY c.period_number, p.sort_order, c.scope`
  );
  res.json({ changes: result.rows });
});

router.get('/parameter-changes/impact', async (req, res) => {
  const { parameterId, periodNumber, scope, action } = req.query;

  if (!isUuid(parameterId)) {
    return res.status(400).json({ error: 'parameterId must be a valid ID.' });
  }
  const isDigits =
    typeof periodNumber === 'string' && /^\d+$/.test(periodNumber);
  if (!isDigits || !isValidPeriodNumber(Number(periodNumber))) {
    return res.status(400).json({
      error: `periodNumber must be a whole number from 1 to ${MAX_PERIOD}.`,
    });
  }
  if (!SCOPES.includes(scope)) {
    return res
      .status(400)
      .json({ error: `scope must be one of: ${SCOPES.join(', ')}.` });
  }
  if (!ACTIONS.includes(action)) {
    return res
      .status(400)
      .json({ error: `action must be one of: ${ACTIONS.join(', ')}.` });
  }

  const [changesResult, countsResult] = await Promise.all([
    pool.query(
      `SELECT parameter_id  AS "parameterId",
              period_number AS "periodNumber",
              scope,
              action
       FROM parameter_changes
       WHERE parameter_id = $1`,
      [parameterId]
    ),
    pool.query(
      `SELECT period_number AS "periodNumber", count(*)::int AS count
       FROM evaluations
       WHERE parameter_id = $1 AND value IS NOT NULL
       GROUP BY period_number
       ORDER BY period_number`,
      [parameterId]
    ),
  ]);

  res.json(
    hiddenScores({
      changes: changesResult.rows,
      change: {
        parameterId,
        periodNumber: Number(periodNumber),
        scope,
        action,
      },
      scoreCounts: countsResult.rows,
    })
  );
});

router.post('/parameter-changes', async (req, res) => {
  const { parameterId, periodNumber, scope, action } = req.body ?? {};

  if (typeof parameterId !== 'string' || !UUID_PATTERN.test(parameterId)) {
    return res.status(400).json({ error: 'parameterId must be a valid ID.' });
  }
  if (!isValidPeriodNumber(periodNumber)) {
    return res.status(400).json({
      error: `periodNumber must be a whole number from 1 to ${MAX_PERIOD}.`,
    });
  }
  if (!SCOPES.includes(scope)) {
    return res
      .status(400)
      .json({ error: `scope must be one of: ${SCOPES.join(', ')}.` });
  }
  if (!ACTIONS.includes(action)) {
    return res
      .status(400)
      .json({ error: `action must be one of: ${ACTIONS.join(', ')}.` });
  }

  try {
    const result = await pool.query(
      `INSERT INTO parameter_changes (parameter_id, period_number, scope, action)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (parameter_id, period_number, scope)
       DO UPDATE SET action = EXCLUDED.action, created_at = now()
       RETURNING ${CHANGE_COLUMNS}`,
      [parameterId, periodNumber, scope, action]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === FOREIGN_KEY_VIOLATION) {
      return res.status(404).json({ error: 'Parameter not found.' });
    }
    throw err;
  }
});

router.delete('/parameter-changes/:id', async (req, res) => {
  const result = await pool.query(
    'DELETE FROM parameter_changes WHERE id = $1',
    [req.params.id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Change not found.' });
  }
  res.status(204).end();
});

// The period's active parameters. This lives under the `/api/periods` prefix,
// which is only gated at `GET: true` (every signed-in user needs the period
// calendar), so without this explicit check any signed-in user — including a
// Viewer denied `GET /api/parameters` — could read parameter definitions
// through this route. Require `parameters.view` here so the two parameter-read
// paths agree. Every legitimate caller (the Evaluate flow) holds `scores.enter`,
// which has `parameters.view` as a prerequisite, so nothing breaks.
router.get(
  '/periods/:number/parameters',
  requirePermission('parameters.view'),
  async (req, res) => {
    const periodNumber = Number(req.params.number);

    const [changesResult, parametersResult] = await Promise.all([
      pool.query(
        `SELECT parameter_id  AS "parameterId",
              period_number AS "periodNumber",
              scope,
              action
       FROM parameter_changes`
      ),
      pool.query(
        `SELECT ${PARAMETER_COLUMNS}
       FROM parameters
       ORDER BY sort_order, lower(name)`
      ),
    ]);

    const usedIds = new Set(parametersUsedInPeriod(changesResult.rows, periodNumber));
    res.json({
      periodNumber,
      parameters: parametersResult.rows.filter((parameter) =>
        usedIds.has(parameter.id)
      ),
    });
  }
);

export default router;