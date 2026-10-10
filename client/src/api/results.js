import { request } from './http.js';

// One group's results within one period.
//   getResults({ groupId, periodId })            -> group-mode
//   getResults({ groupId, periodId, studentId }) -> that member's own values
//
// Group-mode response:
//   { mode:'group', group:{id,name}, period, members:[{id,fullName,studentCode}],
//     rows:[{ id, parentId, name, unit, depth, isLeaf,
//             effective:{minValue,maxValue,normMin,normMax},
//             own, members:{avg,min,max,count} }] }
// Student-mode response:
//   { mode:'student', group, period, student:{id,fullName,studentCode},
//     rows:[{ ...same node fields..., value }] }
// Parent rows are rolled up at read time (parent value = mean of children);
// `effective` is the widest child span. Rows are a depth-first forest.
export function getResults({ groupId, periodId, studentId = null }) {
  const params = new URLSearchParams({ groupId, periodId });
  if (studentId) params.set('studentId', studentId);
  return request(`/api/results?${params}`);
}
