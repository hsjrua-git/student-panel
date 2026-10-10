import { request } from './http.js';

// Parameters form a tree of any depth. The list/detail/create/update endpoints
// emit a FLAT, depth-tagged forest (DFS order): each node carries
//   { id, parentId, name, unit, minValue, maxValue, normMin, normMax, extra,
//     sortOrder, archivedAt, createdAt, isLeaf, effective, depth }
// where `effective = { minValue, maxValue, normMin, normMax }` is the widest
// child span (a parent's own values are only a fallback). Only LEAF parameters
// are scored; parent values are rolled up at read time elsewhere.

export async function listParameters({ includeArchived = false } = {}) {
  const query = includeArchived ? '?includeArchived=1' : '';
  const data = await request(`/api/parameters${query}`);
  return data.parameters;
}

// One node spread with its `assignments: [{ id, parameterId, groupId,
// studentId, createdAt, groupName, studentName, studentCode }]`.
export function getParameter(id) {
  return request(`/api/parameters/${id}`);
}

// input = { name, parentId?, unit?, minValue?, maxValue?, normMin?, normMax?,
//           extra?, sortOrder? } -> the created node.
export function createParameter(input) {
  return request('/api/parameters', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// Partial update; `archived: true|false` soft-archives / restores.
export function updateParameter(id, fields) {
  return request(`/api/parameters/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

// Soft-archive (sets archived_at); scores are kept, just hidden. -> 204.
export function archiveParameter(id) {
  return request(`/api/parameters/${id}`, { method: 'DELETE' });
}

// Assign a parameter to exactly one of a group or a student.
//   target = { groupId } | { studentId }  -> the created assignment.
export function assignParameter(id, target) {
  return request(`/api/parameters/${id}/assignments`, {
    method: 'POST',
    body: JSON.stringify(target),
  });
}

export function unassignParameter(id, assignmentId) {
  return request(`/api/parameters/${id}/assignments/${assignmentId}`, {
    method: 'DELETE',
  });
}
