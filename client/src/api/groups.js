// Groups api — on-device adapter over the groups service (was fetch to
// /api/groups). listGroups / listStudentGroups / listGroupMembers unwrap their
// key as before; the mutations return the raw service result.

import { callService } from './local.js';
import {
  listGroups as listGroupsService,
  getGroupMembers,
  createGroup as createGroupService,
  updateGroup as updateGroupService,
  archiveGroup as archiveGroupService,
  setGroupMembers,
} from '@server/core/services/groups.js';

export async function listGroups({ includeArchived = false } = {}) {
  const { groups } = await callService(() =>
    listGroupsService({ includeArchived }),
  );
  return groups;
}

export async function listStudentGroups(studentId) {
  const { groups } = await callService(() => listGroupsService({ studentId }));
  return groups;
}

export function createGroup(input) {
  return callService(() => createGroupService(input));
}

export function updateGroup(id, fields) {
  return callService(() => updateGroupService(id, fields));
}

export function archiveGroup(id) {
  return callService(() => archiveGroupService(id));
}

export async function listGroupMembers(id) {
  const { students } = await callService(() => getGroupMembers(id));
  return students;
}

export function updateGroupMembers(id, { add = [], remove = [] }) {
  return callService(() => setGroupMembers(id, { add, remove }));
}
