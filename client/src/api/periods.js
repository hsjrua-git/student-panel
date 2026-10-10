import { request } from './http.js';

// Named, dated periods designed on the Periods page and assigned to groups
// and/or students. A period object is
//   { id, name, startDate, endDate, sortOrder, archivedAt[, createdAt] }
// and the list variant also carries `assignmentCount`.

export async function listPeriods({ includeArchived = false } = {}) {
  const query = includeArchived ? '?includeArchived=1' : '';
  const data = await request(`/api/periods${query}`);
  return data.periods;
}

// One period spread with its `assignments: [{ id, periodId, groupId,
// studentId, createdAt, groupName, studentName, studentCode }]`.
export function getPeriod(id) {
  return request(`/api/periods/${id}`);
}

// input = { name, startDate, endDate } (dates as YYYY-MM-DD).
export function createPeriod(input) {
  return request('/api/periods', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// Partial update: { name?, startDate?, endDate?, sortOrder?, archived? }.
export function updatePeriod(id, fields) {
  return request(`/api/periods/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

// Soft-archive (scores keep pointing at it). -> 204.
export function archivePeriod(id) {
  return request(`/api/periods/${id}`, { method: 'DELETE' });
}

// Assign a period to exactly one of a group or a student.
//   target = { groupId } | { studentId }  -> the created assignment.
export function assignPeriod(id, target) {
  return request(`/api/periods/${id}/assignments`, {
    method: 'POST',
    body: JSON.stringify(target),
  });
}

export function unassignPeriod(id, assignmentId) {
  return request(`/api/periods/${id}/assignments/${assignmentId}`, {
    method: 'DELETE',
  });
}
