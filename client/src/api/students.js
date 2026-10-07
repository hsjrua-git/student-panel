// Students api — on-device adapter over the students service (was fetch to
// /api/students). Each function keeps the exact return shape it had before so
// the pages and hooks that consume them are unchanged.

import { callService } from './local.js';
import {
  listStudents as listStudentsService,
  createStudent as createStudentService,
  updateStudent as updateStudentService,
  deleteStudent as deleteStudentService,
  getStudent as getStudentService,
  importStudents as importStudentsService,
} from '@server/core/services/students.js';

export function listStudents({
  search = '',
  page = 1,
  pageSize = 25,
  sort = 'newest',
  groupId = null,
} = {}) {
  return callService(() =>
    listStudentsService({
      search,
      page,
      pageSize,
      sort,
      groupId: groupId ?? undefined,
    }),
  );
}

export function createStudent(fullName, extra) {
  const input = extra ? { fullName, extra } : { fullName };
  return callService(() => createStudentService(input));
}

export function renameStudent(id, fullName) {
  return callService(() => updateStudentService(id, { fullName }));
}

// Update arbitrary student fields (full name and/or custom fields in `extra`).
export function updateStudent(id, fields) {
  return callService(() => updateStudentService(id, fields));
}

export function deleteStudent(id) {
  return callService(() => deleteStudentService(id));
}

export function getStudent(id) {
  return callService(() => getStudentService(id));
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
  return callService(() =>
    importStudentsService({ rows, allowDuplicateNames, dryRun }),
  );
}
