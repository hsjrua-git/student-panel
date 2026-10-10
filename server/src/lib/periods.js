import pool from '../db/pool.js';

// Read + shape periods and their assignments. A period applies to a student
// inside a group when it is assigned to that group (or an ancestor) or directly
// to the student. Assignments are group XOR student (see 006_periods.sql).

const COLUMNS = `
  id,
  name,
  start_date  AS "startDate",
  end_date    AS "endDate",
  sort_order  AS "sortOrder",
  archived_at AS "archivedAt",
  created_at  AS "createdAt"
`;

export async function fetchPeriodRows(db = pool, { includeArchived = false } = {}) {
  const where = includeArchived ? '' : 'WHERE archived_at IS NULL';
  const result = await db.query(
    `SELECT ${COLUMNS} FROM periods ${where}
     ORDER BY start_date, sort_order, lower(name)`
  );
  return result.rows;
}

export async function fetchPeriod(db, id) {
  const result = await db.query(`SELECT ${COLUMNS} FROM periods WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

// All assignments as { periodId, groupId, studentId }.
export async function fetchPeriodAssignments(db = pool) {
  const result = await db.query(
    `SELECT period_id AS "periodId", group_id AS "groupId", student_id AS "studentId"
       FROM period_assignments`
  );
  return result.rows;
}

// Period ids that apply to the given set of group ids (typically a group plus
// its ancestors) and, optionally, a student. Returns a Set of period ids.
export async function applicablePeriodIds(db, { groupIds = [], studentId = null } = {}) {
  const ids = new Set();
  if (groupIds.length) {
    const byGroup = await db.query(
      `SELECT DISTINCT period_id FROM period_assignments WHERE group_id = ANY($1)`,
      [groupIds]
    );
    for (const row of byGroup.rows) ids.add(row.period_id);
  }
  if (studentId) {
    const byStudent = await db.query(
      `SELECT DISTINCT period_id FROM period_assignments WHERE student_id = $1`,
      [studentId]
    );
    for (const row of byStudent.rows) ids.add(row.period_id);
  }
  return ids;
}
