import { request } from './http.js';

export function getPeriods() {
  return request('/api/periods');
}

export function setPeriodAnchor(anchorDate) {
  return request('/api/settings/period-anchor', {
    method: 'PUT',
    body: JSON.stringify({ anchorDate }),
  });
}