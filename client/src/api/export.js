import { request } from './http.js';
import { getResults } from './results.js';

// Fetch the export cube. Primary path: the additive /api/export/cube endpoint,
// which returns every requested student × parameter × period slice (plus each
// period − 1 for deltas) in one request. Fallback: if that route is unreachable
// or absent (offline, or an older server), loop the existing /api/results one
// period at a time with bounded concurrency and stitch the same shape together.
//
// `scope` is already resolved to concrete values by the page:
//   { periods: number[], groupId?: string|null, studentIds?: string[], parameterIds?: string[] }
export async function fetchCube(scope) {
  const body = { periods: scope.periods };
  if (scope.groupId) body.groupId = scope.groupId;
  if (scope.studentIds?.length) body.studentIds = scope.studentIds;
  if (scope.parameterIds?.length) body.parameterIds = scope.parameterIds;

  try {
    return await request('/api/export/cube', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch (err) {
    // A real 4xx/5xx from the route (e.g. 403 no permission, 400 bad scope) is
    // meaningful — surface it. Only fall back when the route itself is missing
    // (404) or the server is unreachable (no status).
    if (err.status && err.status !== 404) throw err;
    return fetchCubeViaResults(scope);
  }
}

// Run `task` over `items` with at most `limit` in flight at once.
async function mapWithConcurrency(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchCubeViaResults(scope) {
  const numbers = [...new Set(scope.periods)].sort((a, b) => a - b);
  const responses = await mapWithConcurrency(numbers, 5, (number) =>
    getResults(number, scope.groupId ?? null)
  );

  const wantParameters = scope.parameterIds?.length ? new Set(scope.parameterIds) : null;
  const wantStudents = scope.studentIds?.length ? new Set(scope.studentIds) : null;

  // Union the shown parameters across periods, preserving each response's shared
  // sort order; pin to the selection when one was given.
  const columns = [];
  const columnIds = new Set();
  for (const res of responses) {
    for (const parameter of res.parameters) {
      if (wantParameters && !wantParameters.has(parameter.id)) continue;
      if (columnIds.has(parameter.id)) continue;
      columnIds.add(parameter.id);
      columns.push({
        id: parameter.id,
        name: parameter.name,
        unit: parameter.unit,
        minValue: parameter.minValue,
        maxValue: parameter.maxValue,
        inUse: parameter.inUse,
      });
    }
  }

  // The roster is period-independent for a fixed group; union defensively.
  const students = [];
  const studentIds = new Set();
  for (const res of responses) {
    for (const student of res.students) {
      if (wantStudents && !wantStudents.has(student.id)) continue;
      if (studentIds.has(student.id)) continue;
      studentIds.add(student.id);
      students.push({ id: student.id, fullName: student.fullName, studentCode: student.studentCode });
    }
  }

  // Current-period cells first; then period − 1 values from each response's
  // `previous` map, but only for a key not already carried by a fetched period.
  const cellByKey = new Map();
  const key = (s, p, n) => `${s}:${p}:${n}`;
  for (const res of responses) {
    for (const student of res.students) {
      if (wantStudents && !wantStudents.has(student.id)) continue;
      for (const [parameterId, value] of Object.entries(student.values ?? {})) {
        if (!columnIds.has(parameterId)) continue;
        cellByKey.set(key(student.id, parameterId, res.periodNumber), {
          studentId: student.id,
          parameterId,
          periodNumber: res.periodNumber,
          value,
        });
      }
    }
  }
  for (const res of responses) {
    for (const student of res.students) {
      if (wantStudents && !wantStudents.has(student.id)) continue;
      for (const [parameterId, value] of Object.entries(student.previous ?? {})) {
        if (!columnIds.has(parameterId)) continue;
        const k = key(student.id, parameterId, res.periodNumber - 1);
        if (cellByKey.has(k)) continue;
        cellByKey.set(k, {
          studentId: student.id,
          parameterId,
          periodNumber: res.periodNumber - 1,
          value,
        });
      }
    }
  }

  const usedById = new Map(columns.map((parameter) => [parameter.id, parameter.inUse]));
  const periods = responses.map((res) => ({
    number: res.periodNumber,
    startDate: res.startDate,
    endDate: res.endDate,
    parameterIds: res.parameters
      .filter((parameter) => columnIds.has(parameter.id) && usedById.get(parameter.id))
      .map((parameter) => parameter.id),
  }));

  return {
    periods,
    parameters: columns,
    students,
    cells: [...cellByKey.values()],
    total: responses.reduce((max, res) => Math.max(max, res.total ?? 0), 0),
    truncated: responses.some((res) => res.truncated),
  };
}
