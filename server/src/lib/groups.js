import pool from '../db/pool.js';
import { buildForest, isAncestor, subtreeIds } from './tree.js';

// Read + shape the student-group tree, membership helpers, and cycle prevention
// for re-parenting. Membership is stored as DIRECT links; subtree membership is
// computed by walking parent_id.

const COLUMNS = `
  id,
  parent_id   AS "parentId",
  name,
  sort_order  AS "sortOrder",
  archived_at AS "archivedAt",
  created_at  AS "createdAt"
`;

export async function fetchGroupRows(db = pool, { includeArchived = false } = {}) {
  const where = includeArchived ? '' : 'WHERE archived_at IS NULL';
  const result = await db.query(
    `SELECT ${COLUMNS} FROM student_groups ${where}
     ORDER BY sort_order, lower(name)`
  );
  return result.rows;
}

export function buildGroupTree(rows) {
  return buildForest(rows);
}

export function parentByIdMap(rows) {
  return new Map(rows.map((r) => [r.id, r.parentId ?? null]));
}

export function childrenByIdMap(rows) {
  const map = new Map();
  for (const r of rows) map.set(r.id, []);
  for (const r of rows) {
    if (r.parentId != null && map.has(r.parentId)) map.get(r.parentId).push(r.id);
  }
  return map;
}

// A group may not become its own descendant. Returns true if setting
// `newParentId` as the parent of `groupId` would create a cycle.
export function wouldCreateCycle(rows, groupId, newParentId) {
  if (newParentId == null) return false;
  if (newParentId === groupId) return true;
  const parentById = parentByIdMap(rows);
  // Cycle iff groupId is an ancestor of (or equal to) newParentId.
  return isAncestor(parentById, groupId, newParentId);
}

// The group's own id plus every descendant group id.
export function groupSubtreeIds(rows, groupId) {
  return subtreeIds(childrenByIdMap(rows), groupId);
}

// Direct members of a group: [{ id, fullName, studentCode }].
export async function fetchDirectMembers(db, groupId) {
  const result = await db.query(
    `SELECT s.id, s.full_name AS "fullName", s.student_code AS "studentCode"
       FROM student_group_members m
       JOIN students s ON s.id = m.student_id
      WHERE m.group_id = $1 AND s.deleted_at IS NULL
      ORDER BY lower(s.full_name)`,
    [groupId]
  );
  return result.rows;
}

// Count of direct members per group id, as a Map.
export async function memberCounts(db = pool) {
  const result = await db.query(
    `SELECT m.group_id AS "groupId", COUNT(*)::int AS count
       FROM student_group_members m
       JOIN students s ON s.id = m.student_id AND s.deleted_at IS NULL
      GROUP BY m.group_id`
  );
  const map = new Map();
  for (const row of result.rows) map.set(row.groupId, row.count);
  return map;
}
