import { parametersUsedInPeriod } from './parameterUse.js';

// The Export Center's data source. Where /api/results serves one period at a
// time for the Results grid, the cube serves an arbitrary set of periods in one
// request so the client can build any student × parameter × period slice
// without looping. Same student cap as results so a huge roster can't be pulled
// in one shot.
export const MAX_EXPORT_STUDENTS = 5000;

// Assemble the cube response body from raw DB rows. Pure so it can be unit
// tested without a database; the route owns the SQL and hands the rows here.
//
// - periods: the REQUESTED period numbers (unique, ascending).
// - parameters: every parameter definition, ordered as the columns should read.
// - changes: parameter_changes rows [{parameterId, periodNumber, scope, action}].
// - students: the (already-bounded) roster [{id, fullName, studentCode}].
// - evaluations: scored cells across the requested periods AND each requested
//   period minus one (the "previous" the client needs for deltas), shaped
//   [{studentId, parameterId, periodNumber, value}].
// - selectedParameterIds: null for "all relevant" (in use in, or scored in, any
//   requested period), or an explicit id list to pin the columns.
// - periodDatesFor: (number) => { startDate, endDate }.
export function buildCube({
  periods,
  parameters,
  changes,
  students,
  evaluations,
  selectedParameterIds,
  periodDatesFor,
}) {
  const activeIds = new Set(students.map((student) => student.id));
  const requested = new Set(periods);

  const usedByPeriod = new Map();
  for (const number of periods) {
    usedByPeriod.set(number, new Set(parametersUsedInPeriod(changes, number)));
  }

  // Which parameters actually carry a score somewhere in the requested range —
  // so "all" columns includes a parameter that was scored even if it is no
  // longer marked in use, mirroring buildResults()'s "shown" rule.
  const scoredInRange = new Set();
  for (const cell of evaluations) {
    if (!activeIds.has(cell.studentId)) continue;
    if (requested.has(cell.periodNumber)) scoredInRange.add(cell.parameterId);
  }

  let columns;
  if (selectedParameterIds) {
    const selected = new Set(selectedParameterIds);
    columns = parameters.filter((parameter) => selected.has(parameter.id));
  } else {
    columns = parameters.filter((parameter) => {
      if (scoredInRange.has(parameter.id)) return true;
      for (const number of periods) {
        if (usedByPeriod.get(number).has(parameter.id)) return true;
      }
      return false;
    });
  }
  const columnSet = new Set(columns.map((parameter) => parameter.id));

  // Keep only cells for a live student and a shown parameter. Cells from a
  // period − 1 that is not itself requested stay in the list so the client can
  // resolve the "previous" value for a delta.
  const cells = [];
  for (const cell of evaluations) {
    if (!activeIds.has(cell.studentId)) continue;
    if (!columnSet.has(cell.parameterId)) continue;
    cells.push({
      studentId: cell.studentId,
      parameterId: cell.parameterId,
      periodNumber: cell.periodNumber,
      value: cell.value,
    });
  }

  return {
    periods: periods.map((number) => ({
      number,
      ...periodDatesFor(number),
      parameterIds: columns
        .filter((parameter) => usedByPeriod.get(number).has(parameter.id))
        .map((parameter) => parameter.id),
    })),
    parameters: columns.map((parameter) => ({
      id: parameter.id,
      name: parameter.name,
      unit: parameter.unit,
      minValue: parameter.minValue,
      maxValue: parameter.maxValue,
      inUse: periods.some((number) => usedByPeriod.get(number).has(parameter.id)),
    })),
    students: students.map((student) => ({
      id: student.id,
      fullName: student.fullName,
      studentCode: student.studentCode,
    })),
    cells,
  };
}
