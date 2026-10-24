// Evaluations api — on-device adapter over the evaluations service (was fetch
// to /api/evaluations and /api/periods/:n/parameters). listPeriodParameters,
// listEvaluations and listStudentEvaluations unwrap their key as before;
// saveEvaluations returns the raw service result (dry-run preview or save
// summary).

import { callService } from './local.js';
import {
  getEvaluations,
  saveEvaluationsBulk,
} from '@server/core/services/evaluations.js';
import { parametersForPeriod } from '@server/core/services/parameters.js';

export async function listPeriodParameters(periodNumber) {
  const { parameters } = await callService(() =>
    parametersForPeriod(periodNumber),
  );
  return parameters;
}

export async function listEvaluations({ periodNumber }) {
  const { evaluations } = await callService(() =>
    getEvaluations({ periodNumber, includeCleared: true }),
  );
  return evaluations;
}

export function saveEvaluations({
  periodNumber,
  entries,
  overrideReason,
  dryRun,
  source,
}) {
  return callService(() =>
    saveEvaluationsBulk({
      periodNumber,
      entries,
      ...(overrideReason ? { overrideReason } : {}),
      ...(dryRun ? { dryRun: true } : {}),
      ...(source ? { source } : {}),
    }),
  );
}

export async function listStudentEvaluations(studentId) {
  const { evaluations } = await callService(() => getEvaluations({ studentId }));
  return evaluations;
}
