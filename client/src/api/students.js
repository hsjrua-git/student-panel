import { request } from './http.js';

export async function listStudents() {
  const data = await request('/api/students');
  return data.students;
}

export function createStudent(fullName) {
  return request('/api/students', {
    method: 'POST',
    body: JSON.stringify({ fullName }),
  });
}