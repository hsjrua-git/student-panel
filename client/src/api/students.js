import { request } from './http.js';

// Students API. Birthdate and gender are mandatory server-side; `extra` is a
// map keyed by custom field-definition id. The server assigns student_code.

export function listStudents({
  search = '',
  page = 1,
  pageSize = 25,
  sort = 'newest',
  groupId = null,
  ungrouped = false,
  revealRestricted = false,
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sort,
  });
  if (search) params.set('search', search);
  if (groupId) params.set('groupId', groupId);
  if (ungrouped) params.set('ungrouped', '1');
  if (revealRestricted) params.set('revealRestricted', '1');
  return request(`/api/students?${params}`);
}

// Create a student. `input` = { fullName, birthdate, gender, extra? }.
export function createStudent(input) {
  return request('/api/students', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// Partial update: any of { fullName, birthdate, gender, extra }. student_code
// is immutable (server rejects attempts to change it).
export function updateStudent(id, fields) {
  return request(`/api/students/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

// Convenience wrapper used by inline rename.
export function renameStudent(id, fullName) {
  return updateStudent(id, { fullName });
}

export function deleteStudent(id) {
  return request(`/api/students/${id}`, { method: 'DELETE' });
}

export function getStudent(id) {
  return request(`/api/students/${id}`);
}

// Fetch every student (paginated under the hood) for pickers/exports.
export async function fetchAllStudents() {
  const all = [];
  for (let page = 1; page <= 100; page++) {
    const data = await listStudents({ page, pageSize: 100, sort: 'name' });
    all.push(...data.students);
    if (all.length >= data.total || data.students.length === 0) break;
  }
  return all;
}

export function importStudents({ rows, allowDuplicateNames, dryRun }) {
  return request('/api/students/import', {
    method: 'POST',
    body: JSON.stringify({ rows, allowDuplicateNames, dryRun }),
  });
}
