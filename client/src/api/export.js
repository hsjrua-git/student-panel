import { request } from './http.js';

// The export cube: one flat row per stored evaluation cell, joined to the
// group / student / parameter / period names needed for a readable export.
// Every filter is optional and ANDed together.
//
//   scope = {
//     groupId?,            // restrict to this group (and its subtree if asked)
//     includeSubtree?,     // truthy -> also include descendant groups
//     studentIds?,         // string[] (a null id row = the group's own cells)
//     parameterIds?,       // string[]
//     periodIds?,          // string[]
//   }
//
// -> { rows: [{ groupId, groupName, studentId, studentName, studentCode,
//               parameterId, parameterName, unit, periodId, periodName,
//               startDate, endDate, value, comment, isLocked }],
//      total, truncated }
//
// The server returns JSON only; CSV/XLSX and charts are built on the client
// (see lib/csv.js and the recharts chart components).
export function fetchCube(scope = {}) {
  const body = {};
  if (scope.groupId) body.groupId = scope.groupId;
  if (scope.includeSubtree) body.includeSubtree = true;
  if (scope.studentIds?.length) body.studentIds = scope.studentIds;
  if (scope.parameterIds?.length) body.parameterIds = scope.parameterIds;
  if (scope.periodIds?.length) body.periodIds = scope.periodIds;
  return request('/api/export/cube', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
