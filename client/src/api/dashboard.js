import { request } from './http.js';

export async function getTrends(groupId = null) {
  const query = groupId ? `?groupId=${groupId}` : '';
  const data = await request(`/api/dashboard/trends${query}`);
  return data.trends;
}
