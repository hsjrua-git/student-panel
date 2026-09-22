import { request } from './http.js';

export async function getTrends() {
  const data = await request('/api/dashboard/trends');
  return data.trends;
}