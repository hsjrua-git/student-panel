import { request } from './http.js';

export function getResults(periodNumber, groupId = null) {
  const params = new URLSearchParams({ periodNumber: String(periodNumber) });
  if (groupId) params.set('groupId', groupId);
  return request(`/api/results?${params}`);
}
