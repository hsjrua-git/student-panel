import { request } from './http.js';

export function listStudents({
  search = '',
  page = 1,
  pageSize = 25,
  sort = 'newest',
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sort,
  });
  if (search) params.set('search', search);
  return request(`/api/students?${params}`);
}

export function createStudent(fullName) {
  return request('/api/students', {
    method: 'POST',
    body: JSON.stringify({ fullName }),
  });
}

export function renameStudent(id, fullName) {
  return request(`/api/students/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fullName }),
  });
}

export function deleteStudent(id) {
  return request(`/api/students/${id}`, { method: 'DELETE' });
}

export function getStudent(id) {
  return request(`/api/students/${id}`);
}
export async function fetchAllStudents() {
  const all = [];
  for (let page = 1; page <= 50; page++) {
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