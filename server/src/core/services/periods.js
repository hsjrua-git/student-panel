// Period calendar and its anchor date — service layer (framework-free).
//
// On-device equivalent of routes/periods.js. Plain args in, plain data out,
// ServiceError instead of status codes, getDb() for the pool. No audit, no
// req.user in the original route, so the conversion is purely pool -> getDb()
// and res.status(...) -> ServiceError. The anchor lives as a single row in the
// settings table; all period math reuses lib/periods.js verbatim.

import { getDb } from '../db.js';
import { ServiceError } from '../errors.js';
import {
  isSaturday,
  isValidIsoDate,
  periodDates,
  periodForDate,
  todayIso,
} from '../../lib/periods.js';
import { parametersUsedInPeriod } from '../../lib/parameterUse.js';

const ANCHOR_KEY = 'period_anchor_date';

async function readAnchor(db) {
  const result = await db.query(
    'SELECT value FROM settings WHERE key = $1',
    [ANCHOR_KEY],
  );
  return result.rows[0]?.value ?? null;
}

// The configured anchor date (a Saturday, YYYY-MM-DD) or null if unset.
export async function getPeriodAnchor() {
  const db = getDb();
  return { anchorDate: await readAnchor(db) };
}

// Set the anchor date. Must be a real ISO date that falls on a Saturday, and
// cannot be changed once any score exists (that would renumber every period).
export async function setPeriodAnchor(anchorDate) {
  const db = getDb();

  if (!isValidIsoDate(anchorDate)) {
    throw ServiceError.validation(
      'anchorDate must be a real date written as YYYY-MM-DD.',
    );
  }
  if (!isSaturday(anchorDate)) {
    throw ServiceError.validation('The anchor date must be a Saturday.');
  }

  if ((await readAnchor(db)) !== anchorDate) {
    const scores = await db.query('SELECT 1 FROM evaluations LIMIT 1');
    if (scores.rowCount > 0) {
      throw ServiceError.conflict(
        'The anchor date cannot be changed after scores exist.',
      );
    }
  }

  await db.query(
    `INSERT INTO settings (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = now()`,
    [ANCHOR_KEY, anchorDate],
  );
  return { anchorDate };
}

// The period calendar from period 1 through the current period, each with the
// parameter ids active in it. Returns an empty calendar when no anchor is set.
export async function listPeriods() {
  const db = getDb();
  const today = todayIso();
  const anchorDate = await readAnchor(db);
  if (!anchorDate) {
    return { anchorDate: null, today, current: null, periods: [] };
  }

  const changesResult = await db.query(
    `SELECT parameter_id  AS "parameterId",
            period_number AS "periodNumber",
            scope,
            action
     FROM parameter_changes`,
  );

  const current = periodForDate(anchorDate, today);
  const periods = [];
  for (let number = 1; number <= (current ?? 0); number++) {
    periods.push({
      ...periodDates(anchorDate, number),
      parameterIds: parametersUsedInPeriod(changesResult.rows, number),
    });
  }
  return { anchorDate, today, current, periods };
}
