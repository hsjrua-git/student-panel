import { request } from './http.js';

// Six headline counts for the main dashboard:
//   { students, groups, parameters, periods, tasks, scores }
export async function getSummary() {
  const data = await request('/api/dashboard/summary');
  return data.summary;
}

// Trend series for one group (optionally one of its members).
//   getTrends({ groupId })            -> group-mode (rolled-up group values)
//   getTrends({ groupId, studentId }) -> that member's values within the group
// -> { mode, group:{id,name},
//      parameters:[{ id, parentId, name, unit, depth, isLeaf, effective }],
//      periods:[{ id, name, startDate, endDate }],
//      series:[{ parameterId, periodId, value }] }  (series is sparse)
export function getTrends({ groupId, studentId = null }) {
  const params = new URLSearchParams({ groupId });
  if (studentId) params.set('studentId', studentId);
  return request(`/api/dashboard/trends?${params}`);
}
