import { request } from './http.js';

export function listStudents({ search = '', page = 1, pageSize = 25 } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
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