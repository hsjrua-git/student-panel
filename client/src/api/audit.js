import { request } from './http.js';

export function listAudit({ category = '', actor = '', page = 1 } = {}) {
  const params = new URLSearchParams({ page: String(page) });
  if (category) params.set('category', category);
  if (actor) params.set('actor', actor);
  return request(`/api/audit?${params}`);
}