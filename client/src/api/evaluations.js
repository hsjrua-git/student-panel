import { request } from './http.js';

export async function listPeriodParameters(periodNumber) {
  const data = await request(`/api/periods/${periodNumber}/parameters`);
  return data.parameters;
}

export async function listEvaluations({ periodNumber }) {
  const data = await request(
    `/api/evaluations?periodNumber=${periodNumber}&includeCleared=1`
  );
  return data.evaluations;
}

export function saveEvaluations({
  periodNumber,
  entries,
  overrideReason,
  dryRun,
  source,
}) {
  return request('/api/evaluations/bulk', {
    method: 'PUT',
    body: JSON.stringify({
      periodNumber,
      entries,
      ...(overrideReason ? { overrideReason } : {}),
      ...(dryRun ? { dryRun: true } : {}),
      ...(source ? { source } : {}),
    }),
  });
}

export async function listStudentEvaluations(studentId) {
  const data = await request(`/api/evaluations?studentId=${studentId}`);
  return data.evaluations;
}