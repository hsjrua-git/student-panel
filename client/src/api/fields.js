// Field definitions api — on-device adapter over the fields service (was fetch
// to /api/field-definitions). Return shapes unchanged: listFieldDefinitions
// returns the bare fields array, the rest return the raw service result.

import { callService } from './local.js';
import {
  listFields,
  createField,
  updateField,
  archiveField,
} from '@server/core/services/fields.js';

export async function listFieldDefinitions({ includeArchived = false } = {}) {
  const { fields } = await callService(() => listFields({ includeArchived }));
  return fields;
}

export function createFieldDefinition(input) {
  return callService(() => createField(input));
}

export function updateFieldDefinition(id, fields) {
  return callService(() => updateField(id, fields));
}

export function archiveFieldDefinition(id) {
  return callService(() => archiveField(id));
}
