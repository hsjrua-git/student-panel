import pool from '../db/pool.js';

// Pure helpers + small reads for the evaluation surface. A student is scored
// SEPARATELY inside each group they belong to (evaluations.group_id NOT NULL);
// a group also holds its own direct scores (student_id NULL). Only LEAF
// parameters are scored — parents are derived at read time (see lib/parameters.js).

export const MAX_COMMENT = 500;

// A stable key for a matrix cell. The group's own column uses the sentinel
// 'group' (student_id is NULL for those rows).
export function cellKey(studentId, parameterId) {
  return `${studentId ?? 'group'}:${parameterId}`;
}

// Parse a score value: a finite number, or null to clear. Accepts numeric
// strings. Anything else is an error.
export function parseValue(input) {
  if (input === null || input === undefined || input === '') return { value: null };
  if (typeof input === 'number' && Number.isFinite(input)) return { value: input };
  if (typeof input === 'string' && input.trim() !== '' && Number.isFinite(Number(input))) {
    return { value: Number(input) };
  }
  return { error: 'A score must be a number or blank.' };
}

// Parse a comment: null/'' clears it; otherwise a string of at most MAX_COMMENT.
export function parseComment(input) {
  if (input === null || input === undefined || input === '') return { value: null };
  if (typeof input !== 'string') return { error: 'A comment must be text.' };
  if (input.length > MAX_COMMENT) {
    return { error: `A comment is too long (max ${MAX_COMMENT}).` };
  }
  return { value: input };
}

// A group's id plus every ancestor group id, walking parent links.
export function groupAndAncestorIds(parentById, groupId) {
  const out = [];
  let current = groupId;
  const seen = new Set();
  while (current != null && !seen.has(current)) {
    seen.add(current);
    out.push(current);
    current = parentById.get(current) ?? null;
  }
  return out;
}

// Which of `allParamIds` apply to a target. A parameter with NO assignments at
// all is global (applies everywhere); once it has any assignment it applies only
// where assigned — to one of `groupIds` (the group + its ancestors) or directly
// to `studentId`.
export function applicableParameterIds(assignments, allParamIds, { groupIds = [], studentId = null } = {}) {
  const byParam = new Map();
  for (const a of assignments) {
    if (!byParam.has(a.parameterId)) byParam.set(a.parameterId, { groups: new Set(), students: new Set() });
    if (a.groupId) byParam.get(a.parameterId).groups.add(a.groupId);
    if (a.studentId) byParam.get(a.parameterId).students.add(a.studentId);
  }
  const groupSet = new Set(groupIds);
  const out = new Set();
  for (const pid of allParamIds) {
    const rec = byParam.get(pid);
    if (!rec) {
      out.add(pid);
      continue;
    }
    let ok = false;
    for (const g of rec.groups) {
      if (groupSet.has(g)) {
        ok = true;
        break;
      }
    }
    if (!ok && studentId && rec.students.has(studentId)) ok = true;
    if (ok) out.add(pid);
  }
  return out;
}

export async function fetchParameterAssignments(db = pool) {
  const result = await db.query(
    `SELECT parameter_id AS "parameterId", group_id AS "groupId", student_id AS "studentId"
       FROM parameter_assignments`
  );
  return result.rows;
}
