import { request } from './http.js';

// Tasks are open-ended work items, optionally tied to a parameter. A task
// assignment targets exactly one of a group or a student, optionally scoped to
// a period, and carries a `done` completion flag. A task is NOT a score.

// Each task: { id, title, description, parameterId, extra, sortOrder,
//   archivedAt, createdAt, assignmentCount, doneCount }.
export async function listTasks({ includeArchived = false } = {}) {
  const query = includeArchived ? '?includeArchived=1' : '';
  const data = await request(`/api/tasks${query}`);
  return data.tasks;
}

// One task spread with its `assignments: [{ id, taskId, groupId, studentId,
// periodId, done, doneAt, createdAt, groupName, studentName, studentCode,
// periodName }]`.
export function getTask(id) {
  return request(`/api/tasks/${id}`);
}

// input = { title, description?, extra?, parameterId? }.
export function createTask(input) {
  return request('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// Partial update: { title?, description?, parameterId?, extra?, sortOrder?,
// archived? }.
export function updateTask(id, fields) {
  return request(`/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

// Soft-archive (keeps assignment history). -> 204.
export function archiveTask(id) {
  return request(`/api/tasks/${id}`, { method: 'DELETE' });
}

// Assign to exactly one of a group or a student, optionally scoped to a period.
//   target = { groupId?|studentId?, periodId? }  -> the created assignment.
export function assignTask(id, target) {
  return request(`/api/tasks/${id}/assignments`, {
    method: 'POST',
    body: JSON.stringify(target),
  });
}

export function unassignTask(id, assignmentId) {
  return request(`/api/tasks/${id}/assignments/${assignmentId}`, {
    method: 'DELETE',
  });
}

// Toggle one assignment's completion checkbox. -> the updated assignment.
export function setTaskCompletion(id, { assignmentId, done }) {
  return request(`/api/tasks/${id}/completion`, {
    method: 'PUT',
    body: JSON.stringify({ assignmentId, done }),
  });
}
