import { request } from './http.js';

// Scores live per (group, student?, parameter, period). `studentId: null` is the
// group's OWN direct score inside that group; a non-null studentId is that
// student's score within the group. Only leaf parameters are scored.

// The evaluate grid for one group within one period:
//   { group:{id,name}, period, parameters:[leaf nodes],
//     columns:[{ key, studentId, kind:'group'|'student', label[, studentCode] }],
//     cells:{ [`${studentId ?? 'group'}:${parameterId}`]:
//               { value, comment, lockedAt, isLocked } } }
export function getMatrix({ groupId, periodId }) {
  const params = new URLSearchParams({ groupId, periodId });
  return request(`/api/evaluations/matrix?${params}`);
}

// Raw rows; needs at least a groupId or periodId. `studentId:'none'` selects
// the group-own rows; a UUID selects that student's.
export async function listEvaluations({
  groupId,
  periodId,
  parameterId,
  studentId,
} = {}) {
  const params = new URLSearchParams();
  if (groupId) params.set('groupId', groupId);
  if (periodId) params.set('periodId', periodId);
  if (parameterId) params.set('parameterId', parameterId);
  if (studentId) params.set('studentId', studentId);
  const data = await request(`/api/evaluations?${params}`);
  return data.evaluations;
}

// Bulk save / dry-run preview. Each entry:
//   { groupId, studentId?: string|null, parameterId, value, comment? }
// value is a number or null/'' (clear); omit `comment` to leave it untouched.
// dryRun -> { dryRun:true, periodId, cells, problems, counts }.
// real   -> { periodId, changed } | 400 {error,problems} | 409 OVERRIDE_REASON_REQUIRED.
export function saveEvaluations({ periodId, entries, overrideReason, dryRun }) {
  return request('/api/evaluations/bulk', {
    method: 'PUT',
    body: JSON.stringify({
      periodId,
      entries,
      ...(overrideReason ? { overrideReason } : {}),
      ...(dryRun ? { dryRun: true } : {}),
    }),
  });
}

// Lock / unlock existing cells.
//   cells = [{ groupId, parameterId, studentId?: string|null }]
// -> { periodId, locked, changed }.
export function lockCells({ periodId, cells, locked }) {
  return request('/api/evaluations/lock', {
    method: 'PUT',
    body: JSON.stringify({ periodId, cells, locked }),
  });
}
