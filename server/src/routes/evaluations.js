import { Router } from 'express';
import pool from '../db/pool.js';
import { recordAudit } from '../lib/audit.js';
import { isUuid } from '../lib/ids.js';
import {
  findLockedChanges,
  lockDaysFor,
  parseOverrideReason,
} from '../lib/locks.js';
import { periodForDate, todayIso } from '../lib/periods.js';
import {
  MAX_PERIOD,
  isValidPeriodNumber,
  parametersUsedInPeriod,
} from '../lib/parameterUse.js';
import { userCan } from '../middleware/auth.js';
import {
  findProblems,
  normalizeComment,
  validateShape,
} from '../lib/evaluationCheck.js';
import { previewCells, previewCounts } from '../lib/scorePreview.js';

const router = Router();

router.get('/evaluations', async (req, res) => {
  const { studentId, parameterId, periodNumber } = req.query;
  const includeCleared = req.query.includeCleared === '1';
  const conditions = includeCleared
    ? []
    : ['(value IS NOT NULL OR comment IS NOT NULL)'];
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
    values
  );
  res.json({ evaluations: result.rows });
});

router.put('/evaluations/bulk', async (req, res) => {
  const {
    periodNumber,
    entries,
    overrideReason: reasonInput,
    dryRun = false,
    source,
  } = req.body ?? {};

  if (typeof dryRun !== 'boolean') {
    return res.status(400).json({ error: 'dryRun must be true or false.' });
  }
  if (source !== undefined && source !== 'import') {
    return res.status(400).json({ error: 'Unknown source.' });
  }
  if (!isValidPeriodNumber(periodNumber)) {
    return res.status(400).json({
      error: `periodNumber must be a whole number from 1 to ${MAX_PERIOD}.`,
    });
  }
  const shapeError = validateShape(entries);
  if (shapeError) {
    return res.status(400).json({ error: shapeError });
  }
  // Normalise any notes now so every later comparison uses the clean value.
  for (const entry of entries) {
    if ('comment' in entry) entry.comment = normalizeComment(entry.comment);
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
      `SELECT id,
              full_name    AS "fullName",
              student_code AS "studentCode"
       FROM students
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
  const studentsById = new Map(
    studentsResult.rows.map((student) => [student.id, student])
  );

  const problems = findProblems({
    entries,
    usedParameters,
    knownStudentIds: new Set(studentsById.keys()),
    periodNumber,
  });

  if (dryRun) {
    const existingResult = await pool.query(
      `SELECT student_id          AS "studentId",
              parameter_id        AS "parameterId",
              value::float8       AS value,
              comment,
              locks_at            AS "lockedAt",
              (locks_at <= now()) AS "isLocked"
       FROM evaluations
       WHERE period_number = $1 AND student_id = ANY($2::uuid[])`,
      [periodNumber, studentIds]
    );
    const existingMap = new Map(
      existingResult.rows.map((row) => [
        `${row.studentId}:${row.parameterId}`,
        row,
      ])
    );
    // A blind-entry role (scores.enter but not scores.view) gets a redacted
    // preview: it may confirm what it is about to write, but never reads the
    // existing scores back. See previewCells + lib/permissions.js.
    const canViewScores = userCan(req, 'scores.view');
    const cells = previewCells({
      entries,
      existing: existingMap,
      problemIndexes: new Set(problems.map((problem) => problem.index)),
      canViewScores,
    });
    return res.json({
      dryRun: true,
      periodNumber,
      cells,
      problems,
      counts: previewCounts(cells, problems),
      ...(canViewScores ? {} : { redacted: true }),
    });
  }

  if (problems.length > 0) {
    return res.status(400).json({
      error: 'Some entries are invalid. Nothing was saved.',
      problems,
    });
  }

  const lockDays = lockDaysFor({ periodNumber, currentPeriod: current });
  const changes = [];
  let overrideReason = null;

  const client = await pool.connect();
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
      [periodNumber, studentIds]
    );
    const existing = new Map(
      existingResult.rows.map((row) => [
        `${row.studentId}:${row.parameterId}`,
        row,
      ])
    );

    const lockedChanges = findLockedChanges({ entries, existing });
    const overriddenKeys = new Set(
      lockedChanges.map((item) => `${item.studentId}:${item.parameterId}`)
    );

    if (lockedChanges.length > 0) {
      const lockedProblems = (message) =>
        lockedChanges.map((item) => ({
          index: item.index,
          studentId: item.studentId,
          parameterId: item.parameterId,
          message,
        }));

      if (!userCan(req, 'scores.override')) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Some scores are locked. Nothing was saved.',
          code: 'LOCKED',
          problems: lockedProblems('Locked. Only an administrator can change it.'),
        });
      }

      const reason = parseOverrideReason(reasonInput);
      if (reason.error) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: reason.error,
          code: 'OVERRIDE_REASON_REQUIRED',
          problems: lockedProblems('Locked. Changing it needs a written reason.'),
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
      const newComment = hasComment ? (entry.comment ?? null) : row?.comment ?? null;
      const hasContent = newValue !== null || newComment !== null;

      const result = !hasContent
        ? await client.query(
            `UPDATE evaluations
             SET value = NULL, comment = NULL, updated_at = now()
             WHERE student_id = $1 AND parameter_id = $2
               AND period_number = $3
               AND (value IS NOT NULL OR comment IS NOT NULL)`,
            [entry.studentId, entry.parameterId, periodNumber]
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
            ]
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
      await recordAudit(client, {
        userId: req.user.id,
        actor: req.user.username,
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
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json({ periodNumber, changed: changes.length });
});

export default router;