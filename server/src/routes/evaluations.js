import { Router } from 'express';
import pool from '../db/pool.js';
import { recordAudit } from '../lib/audit.js';
import { getOperatorName } from '../lib/settings.js';
import { isUuid } from '../lib/ids.js';
import {
  fetchParameterRows,
  buildParameterTree,
  leafIds,
} from '../lib/parameters.js';
import { fetchGroupRows, parentByIdMap, fetchDirectMembers } from '../lib/groups.js';
import { fetchPeriod } from '../lib/periods.js';
import {
  cellKey,
  parseValue,
  parseComment,
  groupAndAncestorIds,
  applicableParameterIds,
  fetchParameterAssignments,
} from '../lib/evaluations.js';

// Scores, in the per-group model. Every score is anchored to a group; the
// student is optional (student_id NULL = the group's own direct score,
// NOT NULL = that member's score within the group). Only LEAF parameters are
// scored — parents are derived at read time. Saves and lock changes are audited
// by this router (listed in RECORDED_BY_THEIR_OWN_ROUTES), so the generic
// middleware skips them.

const router = Router();
const MAX_ENTRIES = 20000;
const MAX_REASON = 500;

// A key that stays unique when a bulk save spans several groups (the matrix
// endpoint works within one group, so its cellKey is enough there).
function scopedKey(groupId, studentId, parameterId) {
  return `${groupId}:${cellKey(studentId, parameterId)}`;
}

function parseOverrideReason(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    return { error: 'Changing a locked score needs a written reason.' };
  }
  const value = input.trim();
  if (value.length > MAX_REASON) {
    return { error: `The reason is too long (max ${MAX_REASON}).` };
  }
  return { value };
}

// Resolve the live leaf-parameter id set once per request.
async function loadLeafIds(db = pool) {
  const rows = await fetchParameterRows(db, { includeArchived: false });
  return new Set(leafIds(buildParameterTree(rows)));
}

// --- Reads -----------------------------------------------------------------

// Filtered read of raw score rows. At least one of groupId / periodId is
// required so this never dumps the whole table. studentId=none returns only a
// group's own scores.
router.get('/', async (req, res) => {
  const { groupId, periodId, parameterId, studentId } = req.query;
  const conditions = [];
  const values = [];

  for (const [name, value] of [
    ['group_id', groupId],
    ['period_id', periodId],
    ['parameter_id', parameterId],
  ]) {
    if (value !== undefined) {
      if (!isUuid(value)) {
        return res.status(400).json({ error: `${name} must be a valid ID.` });
      }
      values.push(value);
      conditions.push(`${name} = $${values.length}`);
    }
  }
  if (studentId !== undefined) {
    if (studentId === 'none') {
      conditions.push('student_id IS NULL');
    } else if (isUuid(studentId)) {
      values.push(studentId);
      conditions.push(`student_id = $${values.length}`);
    } else {
      return res.status(400).json({ error: 'studentId must be a valid ID or "none".' });
    }
  }

  if (groupId === undefined && periodId === undefined) {
    return res.status(400).json({ error: 'Add at least a groupId or a periodId.' });
  }

  const result = await pool.query(
    `SELECT group_id                AS "groupId",
            student_id              AS "studentId",
            parameter_id            AS "parameterId",
            period_id               AS "periodId",
            value::float8           AS value,
            comment,
            updated_at              AS "updatedAt",
            locked_at               AS "lockedAt",
            (locked_at IS NOT NULL) AS "isLocked"
       FROM evaluations
      WHERE ${conditions.join(' AND ')}
      ORDER BY period_id, student_id, parameter_id
      LIMIT ${MAX_ENTRIES}`,
    values
  );
  res.json({ evaluations: result.rows });
});

// The evaluate grid for one group in one period: the applicable leaf
// parameters (rows), the group-own column plus one column per direct member,
// and the current cell values.
router.get('/matrix', async (req, res) => {
  const { groupId, periodId } = req.query;
  if (!isUuid(groupId)) return res.status(400).json({ error: 'groupId must be a valid ID.' });
  if (!isUuid(periodId)) return res.status(400).json({ error: 'periodId must be a valid ID.' });

  const groupRows = await fetchGroupRows(pool, { includeArchived: true });
  const group = groupRows.find((g) => g.id === groupId);
  if (!group || group.archivedAt) return res.status(404).json({ error: 'Group not found.' });

  const period = await fetchPeriod(pool, periodId);
  if (!period) return res.status(404).json({ error: 'Period not found.' });

  const [paramRows, assignments, members] = await Promise.all([
    fetchParameterRows(pool, { includeArchived: false }),
    fetchParameterAssignments(pool),
    fetchDirectMembers(pool, groupId),
  ]);

  const roots = buildParameterTree(paramRows);
  const leaves = leafIds(roots);
  const groupIds = groupAndAncestorIds(parentByIdMap(groupRows), groupId);

  // Rows shown = leaves applicable to the group (and inherited from ancestors),
  // plus any leaf assigned directly to one of the members.
  const applicable = applicableParameterIds(assignments, leaves, { groupIds });
  for (const member of members) {
    for (const pid of applicableParameterIds(assignments, leaves, { groupIds, studentId: member.id })) {
      applicable.add(pid);
    }
  }

  // Preserve tree order, keep only the applicable leaves, drop nested children.
  const byId = new Map(paramRows.map((r) => [r.id, r]));
  const orderedLeaves = leaves
    .filter((id) => applicable.has(id))
    .map((id) => {
      const p = byId.get(id);
      return {
        id: p.id,
        parentId: p.parentId ?? null,
        name: p.name,
        unit: p.unit,
        minValue: p.minValue,
        maxValue: p.maxValue,
        normMin: p.normMin,
        normMax: p.normMax,
        extra: p.extra,
      };
    });

  const columns = [
    { key: 'group', studentId: null, kind: 'group', label: group.name },
    ...members.map((m) => ({
      key: m.id,
      studentId: m.id,
      kind: 'student',
      label: m.fullName,
      studentCode: m.studentCode,
    })),
  ];

  const cellRows = await pool.query(
    `SELECT student_id              AS "studentId",
            parameter_id            AS "parameterId",
            value::float8           AS value,
            comment,
            locked_at               AS "lockedAt",
            (locked_at IS NOT NULL) AS "isLocked"
       FROM evaluations
      WHERE group_id = $1 AND period_id = $2`,
    [groupId, periodId]
  );
  const cells = {};
  for (const row of cellRows.rows) {
    cells[cellKey(row.studentId, row.parameterId)] = {
      value: row.value,
      comment: row.comment,
      lockedAt: row.lockedAt,
      isLocked: row.isLocked,
    };
  }

  res.json({
    group: { id: group.id, name: group.name },
    period,
    parameters: orderedLeaves,
    columns,
    cells,
  });
});

// --- Validation of a bulk save ---------------------------------------------

// Validate the shape of the entries array (not the referenced ids yet).
function validateShape(entries) {
  if (!Array.isArray(entries)) return 'entries must be an array.';
  if (entries.length === 0) return 'Send at least one entry.';
  if (entries.length > MAX_ENTRIES) return `Too many entries (max ${MAX_ENTRIES}).`;
  return null;
}

// Turn the raw entries into normalized rows, collecting per-entry problems.
// `leaves`, `liveGroups` and `memberships` are the sets loaded from the DB.
function normalizeEntries(entries, { leaves, liveGroups, memberships }) {
  const problems = [];
  const normalized = [];

  entries.forEach((entry, index) => {
    const fail = (message) => problems.push({ index, message });
    const { groupId, studentId = null, parameterId } = entry ?? {};

    if (!isUuid(groupId) || !liveGroups.has(groupId)) {
      fail('Unknown group.');
      return;
    }
    if (studentId !== null) {
      if (!isUuid(studentId) || !memberships.has(`${groupId}:${studentId}`)) {
        fail('That student is not a member of the group.');
        return;
      }
    }
    if (!isUuid(parameterId) || !leaves.has(parameterId)) {
      fail('Scores can only be entered on a live leaf parameter.');
      return;
    }

    const value = parseValue(entry.value);
    if (value.error) {
      fail(value.error);
      return;
    }
    const hasComment = 'comment' in entry;
    let comment = { value: null };
    if (hasComment) {
      comment = parseComment(entry.comment);
      if (comment.error) {
        fail(comment.error);
        return;
      }
    }

    normalized.push({
      index,
      groupId,
      studentId,
      parameterId,
      value: value.value,
      hasComment,
      comment: comment.value,
    });
  });

  return { problems, normalized };
}

// --- Bulk save --------------------------------------------------------------

router.put('/bulk', async (req, res) => {
  const { periodId, entries, overrideReason: reasonInput, dryRun = false } = req.body ?? {};

  if (typeof dryRun !== 'boolean') {
    return res.status(400).json({ error: 'dryRun must be true or false.' });
  }
  if (!isUuid(periodId)) {
    return res.status(400).json({ error: 'periodId must be a valid ID.' });
  }
  const shapeError = validateShape(entries);
  if (shapeError) return res.status(400).json({ error: shapeError });

  const period = await fetchPeriod(pool, periodId);
  if (!period) return res.status(404).json({ error: 'Period not found.' });

  const groupIds = [...new Set(entries.map((e) => e?.groupId).filter(isUuid))];
  const memberPairs = entries.filter((e) => e?.studentId != null);

  const [leaves, liveGroupsResult, membersResult] = await Promise.all([
    loadLeafIds(),
    pool.query(
      `SELECT id FROM student_groups WHERE id = ANY($1::uuid[]) AND archived_at IS NULL`,
      [groupIds]
    ),
    memberPairs.length
      ? pool.query(
          `SELECT m.group_id AS "groupId", m.student_id AS "studentId"
             FROM student_group_members m
             JOIN students s ON s.id = m.student_id AND s.deleted_at IS NULL
            WHERE m.group_id = ANY($1::uuid[])`,
          [groupIds]
        )
      : { rows: [] },
  ]);

  const liveGroups = new Set(liveGroupsResult.rows.map((r) => r.id));
  const memberships = new Set(membersResult.rows.map((r) => `${r.groupId}:${r.studentId}`));

  const { problems, normalized } = normalizeEntries(entries, {
    leaves,
    liveGroups,
    memberships,
  });

  // Load the current values for every referenced (group, period) so the preview
  // and the save can compare against what is already stored.
  const existingRows = await pool.query(
    `SELECT group_id                AS "groupId",
            student_id              AS "studentId",
            parameter_id            AS "parameterId",
            value::float8           AS value,
            comment,
            (locked_at IS NOT NULL) AS "isLocked"
       FROM evaluations
      WHERE period_id = $1 AND group_id = ANY($2::uuid[])`,
    [periodId, groupIds]
  );
  const existing = new Map(
    existingRows.rows.map((r) => [scopedKey(r.groupId, r.studentId, r.parameterId), r])
  );

  const describe = (row) => {
    const key = scopedKey(row.groupId, row.studentId, row.parameterId);
    const prev = existing.get(key);
    const newValue = row.value;
    const newComment = row.hasComment ? row.comment : prev?.comment ?? null;
    const hasContent = newValue !== null || newComment !== null;
    const changed =
      (prev?.value ?? null) !== newValue || (prev?.comment ?? null) !== newComment;
    return { key, prev, newValue, newComment, hasContent, changed };
  };

  if (dryRun) {
    const cells = normalized.map((row) => {
      const d = describe(row);
      return {
        index: row.index,
        groupId: row.groupId,
        studentId: row.studentId,
        parameterId: row.parameterId,
        from: d.prev?.value ?? null,
        to: d.newValue,
        status: !d.changed ? 'unchanged' : d.hasContent ? 'changed' : 'cleared',
        wasLocked: Boolean(d.prev?.isLocked),
      };
    });
    const counts = {
      total: normalized.length,
      invalid: problems.length,
      changed: cells.filter((c) => c.status !== 'unchanged').length,
      locked: cells.filter((c) => c.wasLocked && c.status !== 'unchanged').length,
    };
    return res.json({ dryRun: true, periodId, cells, problems, counts });
  }

  if (problems.length > 0) {
    return res.status(400).json({ error: 'Some entries are invalid. Nothing was saved.', problems });
  }

  const changes = [];
  let overrideReason = null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const locked = await client.query(
      `SELECT group_id     AS "groupId",
              student_id   AS "studentId",
              parameter_id AS "parameterId",
              value::float8 AS value,
              comment
         FROM evaluations
        WHERE period_id = $1 AND group_id = ANY($2::uuid[]) AND locked_at IS NOT NULL
        FOR UPDATE`,
      [periodId, groupIds]
    );
    const lockedByKey = new Map(
      locked.rows.map((r) => [scopedKey(r.groupId, r.studentId, r.parameterId), r])
    );

    // A locked cell only blocks the save if this entry actually changes it.
    const lockedChanges = normalized.filter((row) => {
      const prev = lockedByKey.get(scopedKey(row.groupId, row.studentId, row.parameterId));
      if (!prev) return false;
      const newComment = row.hasComment ? row.comment : prev.comment ?? null;
      return (prev.value ?? null) !== row.value || (prev.comment ?? null) !== newComment;
    });

    if (lockedChanges.length > 0) {
      const reason = parseOverrideReason(reasonInput);
      if (reason.error) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: reason.error,
          code: 'OVERRIDE_REASON_REQUIRED',
          problems: lockedChanges.map((row) => ({
            index: row.index,
            message: 'Locked. Changing it needs a written reason.',
          })),
        });
      }
      overrideReason = reason.value;
    }

    for (const row of normalized) {
      const d = describe(row);
      const args = [row.groupId, row.parameterId, periodId];
      let result;

      if (!d.hasContent) {
        // Clear: remove the cell entirely.
        result =
          row.studentId === null
            ? await client.query(
                `DELETE FROM evaluations
                  WHERE group_id = $1 AND student_id IS NULL
                    AND parameter_id = $2 AND period_id = $3`,
                args
              )
            : await client.query(
                `DELETE FROM evaluations
                  WHERE group_id = $1 AND student_id = $4
                    AND parameter_id = $2 AND period_id = $3`,
                [...args, row.studentId]
              );
      } else if (row.studentId === null) {
        result = await client.query(
          `INSERT INTO evaluations (group_id, student_id, parameter_id, period_id, value, comment)
           VALUES ($1, NULL, $2, $3, $4, $5)
           ON CONFLICT (group_id, parameter_id, period_id) WHERE student_id IS NULL
           DO UPDATE SET value = EXCLUDED.value, comment = EXCLUDED.comment, updated_at = now()
           WHERE evaluations.value IS DISTINCT FROM EXCLUDED.value
              OR evaluations.comment IS DISTINCT FROM EXCLUDED.comment`,
          [...args, d.newValue, d.newComment]
        );
      } else {
        result = await client.query(
          `INSERT INTO evaluations (group_id, student_id, parameter_id, period_id, value, comment)
           VALUES ($1, $4, $2, $3, $5, $6)
           ON CONFLICT (group_id, student_id, parameter_id, period_id) WHERE student_id IS NOT NULL
           DO UPDATE SET value = EXCLUDED.value, comment = EXCLUDED.comment, updated_at = now()
           WHERE evaluations.value IS DISTINCT FROM EXCLUDED.value
              OR evaluations.comment IS DISTINCT FROM EXCLUDED.comment`,
          [...args, row.studentId, d.newValue, d.newComment]
        );
      }

      if (result.rowCount > 0) {
        changes.push({
          groupId: row.groupId,
          studentId: row.studentId,
          parameterId: row.parameterId,
          from: d.prev?.value ?? null,
          to: d.newValue,
          override: lockedByKey.has(d.key),
        });
      }
    }

    if (changes.length > 0) {
      await recordAudit(client, {
        actor: await getOperatorName(),
        action: 'scores.save',
        entityType: 'period',
        entityId: periodId,
        details: {
          periodId,
          count: changes.length,
          changes,
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

  res.json({ periodId, changed: changes.length });
});

// --- Locking ----------------------------------------------------------------

// Lock or unlock a set of cells in a period (the "app logic" that sets
// locked_at). Only existing rows are affected. Body:
// { periodId, cells: [{ groupId, studentId?, parameterId }], locked: bool }.
router.put('/lock', async (req, res) => {
  const { periodId, cells, locked } = req.body ?? {};
  if (!isUuid(periodId)) return res.status(400).json({ error: 'periodId must be a valid ID.' });
  if (typeof locked !== 'boolean') return res.status(400).json({ error: 'locked must be true or false.' });
  if (!Array.isArray(cells) || cells.length === 0) {
    return res.status(400).json({ error: 'Send at least one cell.' });
  }
  if (cells.length > MAX_ENTRIES) {
    return res.status(400).json({ error: `Too many cells (max ${MAX_ENTRIES}).` });
  }
  for (const cell of cells) {
    if (!isUuid(cell?.groupId) || !isUuid(cell?.parameterId)) {
      return res.status(400).json({ error: 'Every cell needs a valid groupId and parameterId.' });
    }
    if (cell.studentId != null && !isUuid(cell.studentId)) {
      return res.status(400).json({ error: 'studentId must be a valid ID.' });
    }
  }

  const setClause = locked ? 'locked_at = now()' : 'locked_at = NULL';
  let changed = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const cell of cells) {
      const result =
        cell.studentId == null
          ? await client.query(
              `UPDATE evaluations SET ${setClause}, updated_at = now()
                WHERE group_id = $1 AND student_id IS NULL
                  AND parameter_id = $2 AND period_id = $3`,
              [cell.groupId, cell.parameterId, periodId]
            )
          : await client.query(
              `UPDATE evaluations SET ${setClause}, updated_at = now()
                WHERE group_id = $1 AND student_id = $4
                  AND parameter_id = $2 AND period_id = $3`,
              [cell.groupId, cell.parameterId, periodId, cell.studentId]
            );
      changed += result.rowCount;
    }

    if (changed > 0) {
      await recordAudit(client, {
        actor: await getOperatorName(),
        action: locked ? 'scores.lock' : 'scores.unlock',
        entityType: 'period',
        entityId: periodId,
        details: { periodId, locked, count: changed },
      });
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json({ periodId, locked, changed });
});

export default router;
