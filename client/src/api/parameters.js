// Parameters api — on-device adapter over the parameters service (was fetch to
// /api/parameters and /api/parameter-changes). listParameters and
// listParameterChanges unwrap their key as before; the rest return the raw
// service result.

import { callService } from './local.js';
import {
  listParameters as listParametersService,
  createParameter as createParameterService,
  updateParameter as updateParameterService,
  listParameterChanges as listParameterChangesService,
  deleteParameterChange as deleteParameterChangeService,
  upsertParameterChange,
  parameterChangeImpact,
} from '@server/core/services/parameters.js';

export async function listParameters() {
  const { parameters } = await callService(() => listParametersService());
  return parameters;
}

export function createParameter(input) {
  return callService(() => createParameterService(input));
}

export function updateParameter(id, fields) {
  return callService(() => updateParameterService(id, fields));
}

export async function listParameterChanges() {
  const { changes } = await callService(() => listParameterChangesService());
  return changes;
}

export function deleteParameterChange(id) {
  return callService(() => deleteParameterChangeService(id));
}

export function createParameterChange(change) {
  return callService(() => upsertParameterChange(change));
}

export function getChangeImpact({ parameterId, periodNumber, scope, action }) {
  return callService(() =>
    parameterChangeImpact({ parameterId, periodNumber, scope, action }),
  );
}
