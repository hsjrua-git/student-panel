// Evaluations (periodic scores) — service layer (framework-free).
//
// On-device equivalent of routes/evaluations.js: the read query and the bulk
// save with its dry-run preview, lock/override handling, and audit trail. Plain
// args in, plain data out, ServiceError instead of status codes, getDb() for the
// pool, getLocalActor() for the audit row.
//
// Single-user collapse of the two permission checks the route made:
//   * userCan(req, 'scores.view')     -> always true: the admin owns the data,
//     so the dry-run preview is never redacted (no blind-entry role on-device).
//   * userCan(req, 'scores.override') -> always true: the admin may always edit
//     a locked score. The lock itself is KEPT as a deliberate guardrail — a
//     locked change still needs a written override reason, which is audited.
//
// Rich failures (invalid entries, a missing override reason) carry their
// structured payload on ServiceError.details ({ problems, code }) so the client
// adapter can render the same UI the route's JSON body drove.

import { getDb } from '../db.js';
import { ServiceError } from '../errors.js';
import { getLocalActor } from '../context.js';
import { recordAudit } from '../../lib/audit.js';
import { isUuid } from '../../lib/ids.js';
import {
  findLockedChanges,
  lockDaysFor,
  parseOverrideReason,
} from '../../lib/locks.js';
import { periodForDate, todayIso } from '../../lib/periods.js';
import {
  MAX_PERIOD,
  isValidPeriodNumber,
  parametersUsedInPeriod,
} from '../../lib/parameterUse.js';
import {
  findProblems,
  normalizeComment,
  validateShape,
} from '../../lib/evaluationCheck.js';
import { previewCells, previewCounts } from '../../lib/scorePreview.js';

const PERIOD_MESSAGE = `must be a whole number from 1 to ${MAX_PERIOD}.`;

// Read stored evaluations, filtered by any of studentId / parameterId /
// periodNumber (at least one is required). `includeCleared` returns rows whose
// value and comment are both empty (normally hidden).
// `filters` = { studentId?, parameterId?, periodNumber?, includeCleared? }.
export async function getEvaluations(filters = {}) {
  const db = getDb();
  const { studentId, parameterId, periodNumber } = filters;
  const includeCleared = filters.includeCleared === true;

  const conditions = includeCleared
    ? []
    : ['(value IS NOT NULL OR comment IS NOT NULL)'];
  const values = [];

  if (studentId !== undefined) {
    if (!isUuid(studentId)) {
      throw ServiceError.validation('studentId must be a valid ID.');
    }
    values.push(studentId);
    conditions.push(`student_id = $${values.length}`);
  }
  if (parameterId !== undefined) {
    if (!isUuid(parameterId)) {
      throw ServiceError.validation('parameterId must be a valid ID.');
    }
    values.push(parameterId);
    conditions.push(`parameter_id = $${values.length}`);
  }
  if (periodNumber !== undefined) {
    const number = Number(periodNumber);
    if (!Number.isInteger(number) || !isValidPeriodNumber(number)) {
      throw ServiceError.validation(`periodNumber ${PERIOD_MESSAGE}`);
    }
    values.push(number);
    conditions.push(`period_number = $${values.length}`);
  }

  if (values.length === 0) {
    throw ServiceError.validation(
      'Add at least one filter: studentId, parameterId or periodNumber.',
    );
  }

  const result = await db.query(
    `SELECT student_id          AS "studentId",
            parameter_id        AS "parameterId",
            period_number       AS "periodNumber",
            value::float8       AS value,
            comment,
            updated_at          AS "updatedAt",
            locks_at            AS "lockedAt",
            (locks_at <= now()) AS "isLocked"
     FROM evaluations
     WHERE ${conditions.join(' AND ')}
     ORDER BY period_number, student_id, parameter_id
     LIMIT 20000`,
    values,
  );
  return { evaluations: result.rows };
}

// Validate and (unless dryRun) save a batch of scores for one period.
// `input` = { periodNumber, entries, overrideReason?, dryRun?, source? }.
// Returns the dry-run preview when dryRun is true, otherwise
// { periodNumber, changed }. Throws ServiceError for bad input; invalid entries
// and a missing override reason carry { problems, code } on `.details`.
export async function saveEvaluationsBulk(input = {}) {
  const db = getDb();
  const {
    periodNumber,
    entries,
    overrideReason: reasonInput,
    dryRun = false,
    source,
  } = input ?? {};

  if (typeof dryRun !== 'boolean') {
    throw ServiceError.validation('dryRun must be true or false.');
  }
  if (source !== undefined && source !== 'import') {
    throw ServiceError.validation('Unknown source.');
  }
  if (!isValidPeriodNumber(periodNumber)) {
    throw ServiceError.validation(`periodNumber ${PERIOD_MESSAGE}`);
  }
  const shapeError = validateShape(entries);
  if (shapeError) throw ServiceError.validation(shapeError);

  // Normalise notes now so every later comparison uses the clean value.
  for (const entry of entries) {
    if ('comment' in entry) entry.comment = normalizeComment(entry.comment);
  }

  const anchorResult = await db.query(
    'SELECT value FROM settings WHERE key = $1',
    ['period_anchor_date'],
  );
  const anchorDate = anchorResult.rows[0]?.value;
  if (!anchorDate) {
    throw ServiceError.conflict('Set the period anchor date first.');
  }

  const current = periodForDate(anchorDate, todayIso());
  if (current === null) {
    throw ServiceError.conflict('Period 1 has not started yet.');
  }
  if (periodNumber > current) {
    throw ServiceError.validation(
      `Period ${periodNumber} has not started yet. The current period is ${current}.`,
    );
  }

  const studentIds = [...new Set(entries.map((entry) => entry.studentId))];
  const [changesResult, parametersResult, studentsResult] = await Promise.all([
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
              min_value::float8 AS "minValue",
              max_value::float8 AS "maxValue"
       FROM parameters`,
    ),
    db.query(
      `SELECT id,
              full_name    AS "fullName",
              student_code AS "studentCode"
       FROM students
       WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [studentIds],
    ),
  ]);

  const usedIds = new Set(
    parametersUsedInPeriod(changesResult.rows, periodNumber),
  );
  const usedParameters = new Map(
    parametersResult.rows
      .filter((parameter) => usedIds.has(parameter.id))
      .map((parameter) => [parameter.id, parameter]),
  );
  const studentsById = new Map(
    studentsResult.rows.map((student) => [student.id, student]),
  );

  const problems = findProblems({
    entries,
    usedParameters,
    knownStudentIds: new Set(studentsById.keys()),
    periodNumber,
  });

  if (dryRun) {
    const existingResult = await db.query(
      `SELECT student_id          AS "studentId",
              parameter_id        AS "parameterId",
              value::float8       AS value,
              comment,
              locks_at            AS "lockedAt",
              (locks_at <= now()) AS "isLocked"
       FROM evaluations
       WHERE period_number = $1 AND student_id = ANY($2::uuid[])`,
      [periodNumber, studentIds],
    );
    const existingMap = new Map(
      existingResult.rows.map((row) => [
        `${row.studentId}:${row.parameterId}`,
        row,
      ]),
    );
    // Single admin always sees scores, so the preview is never redacted.
    const cells = previewCells({
      entries,
      existing: existingMap,
      problemIndexes: new Set(problems.map((problem) => problem.index)),
      canViewScores: true,
    });
    return {
      dryRun: true,
      periodNumber,
      cells,
      problems,
      counts: previewCounts(cells, problems),
    };
  }

  if (problems.length > 0) {
    throw ServiceError.validation('Some entries are invalid. Nothing was saved.', {
      problems,
    });
  }

  return saveBulk({
    db,
    periodNumber,
    entries,
    studentIds,
    current,
    usedParameters,
    studentsById,
    reasonInput,
    source,
  });
}

// The transactional write, reached only after validation passed and dryRun is
// false. Locks a snapshot of the affected rows FOR UPDATE, resolves the
// override reason for any locked change (the single admin may always override,
// but a locked change still demands a written reason — audited), then applies
// each entry as a clear or an upsert and records one audit row for the batch.
async function saveBulk({
  db,
  periodNumber,
  entries,
  studentIds,
  current,
  usedParameters,
  studentsById,
  reasonInput,
  source,
}) {
  const lockDays = lockDaysFor({ periodNumber, currentPeriod: current });
  const changes = [];
  let overrideReason = null;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const existingResult = await client.query(
      `SELECT student_id          AS "studentId",
              parameter_id        AS "parameterId",
              value::float8       AS value,
              comment,
              locks_at            AS "lockedAt",
              (locks_at <= now()) AS "isLocked"
       FROM evaluations
       WHERE period_number = $1 AND student_id = ANY($2::uuid[])
       ORDER BY student_id, parameter_id
       FOR UPDATE`,
      [periodNumber, studentIds],
    );
    const existing = new Map(
      existingResult.rows.map((row) => [
        `${row.studentId}:${row.parameterId}`,
        row,
      ]),
    );

    const lockedChanges = findLockedChanges({ entries, existing });
    const overriddenKeys = new Set(
      lockedChanges.map((item) => `${item.studentId}:${item.parameterId}`),
    );

    // Single admin: the "no override permission" 409 path is gone. The lock is
    // still a guardrail — a locked change needs a written reason, which we audit.
    if (lockedChanges.length > 0) {
      const reason = parseOverrideReason(reasonInput);
      if (reason.error) {
        await client.query('ROLLBACK').catch(() => {});
        throw ServiceError.validation(reason.error, {
          code: 'OVERRIDE_REASON_REQUIRED',
          problems: lockedChanges.map((item) => ({
            index: item.index,
            studentId: item.studentId,
            parameterId: item.parameterId,
            message: 'Locked. Changing it needs a written reason.',
          })),
        });
      }
      overrideReason = reason.value;
    }

    for (const entry of entries) {
      const key = `${entry.studentId}:${entry.parameterId}`;
      const row = existing.get(key);
      const hasComment = 'comment' in entry;
      const newValue = entry.value ?? null;
      // If the entry does not carry a note, leave the existing note untouched.
      const newComment = hasComment
        ? entry.comment ?? null
        : row?.comment ?? null;
      const hasContent = newValue !== null || newComment !== null;

      const result = !hasContent
        ? await client.query(
            `UPDATE evaluations
             SET value = NULL, comment = NULL, updated_at = now()
             WHERE student_id = $1 AND parameter_id = $2
               AND period_number = $3
               AND (value IS NOT NULL OR comment IS NOT NULL)`,
            [entry.studentId, entry.parameterId, periodNumber],
          )
        : await client.query(
            `INSERT INTO evaluations
               (student_id, parameter_id, period_number, value, comment, locks_at)
             VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6))
             ON CONFLICT (student_id, parameter_id, period_number)
             DO UPDATE SET value = EXCLUDED.value,
                           comment = EXCLUDED.comment,
                           updated_at = now()
             WHERE evaluations.value IS DISTINCT FROM EXCLUDED.value
                OR evaluations.comment IS DISTINCT FROM EXCLUDED.comment`,
            [
              entry.studentId,
              entry.parameterId,
              periodNumber,
              newValue,
              newComment,
              lockDays,
            ],
          );

      if (result.rowCount > 0) {
        const student = studentsById.get(entry.studentId);
        const fromValue = row?.value ?? null;
        const fromComment = row?.comment ?? null;
        changes.push({
          studentId: entry.studentId,
          student: student.fullName,
          studentCode: student.studentCode,
          parameterId: entry.parameterId,
          parameter: usedParameters.get(entry.parameterId).name,
          from: fromValue,
          to: newValue,
          ...(fromComment !== newComment
            ? { note: { from: fromComment, to: newComment } }
            : {}),
          override: overriddenKeys.has(key),
        });
      }
    }

    if (changes.length > 0) {
      const actor = getLocalActor();
      await recordAudit(client, {
        userId: actor.userId,
        actor: actor.actor,
        action: 'scores.save',
        entityType: 'period',
        entityId: String(periodNumber),
        details: {
          periodNumber,
          count: changes.length,
          changes,
          ...(source === 'import' ? { source: 'import' } : {}),
          ...(overrideReason ? { overrideReason } : {}),
        },
      });
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return { periodNumber, changed: changes.length };
}

