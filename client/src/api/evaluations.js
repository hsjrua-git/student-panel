import { request } from './http.js';

export async function listPeriodParameters(periodNumber) {
  const data = await request(`/api/periods/${periodNumber}/parameters`);
  return data.parameters;
}

export async function listEvaluations({ periodNumber }) {
  const data = await request(`/api/evaluations?periodNumber=${periodNumber}`);
  return data.evaluations;
}

export function saveEvaluations({ periodNumber, entries }) {
  return request('/api/evaluations/bulk', {
    method: 'PUT',
    body: JSON.stringify({ periodNumber, entries }),
  });
}