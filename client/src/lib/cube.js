// The client-side view of the export cube. The server hands back a flat list of
// scored cells for the requested periods plus each period − 1 (the "previous"
// values needed for deltas); this turns that into a lookup keyed by
// student × parameter × period and applies the optional numeric filters.
//
// Filter semantics: a filter narrows the ROSTER, judged against the student's
// value in the LAST requested period (the most recent slice the export covers).
// This mirrors the Results grid, where filters test one period's values — here
// that period is the latest one being exported. Reuses the same operator set as
// resultsView so a filter carried in from Results behaves identically.

const COMPARE = {
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  eq: (a, b) => a === b,
};

function round(number) {
  return Math.round(number * 100) / 100;
}

export function buildCube({ periods = [], parameters = [], students = [], cells = [], filters = [] }) {
  const valueByKey = new Map();
  for (const cell of cells) {
    valueByKey.set(`${cell.studentId}:${cell.parameterId}:${cell.periodNumber}`, cell.value);
  }

  const periodNumbers = periods.map((period) => period.number);
  const lastPeriod = periodNumbers.length ? periodNumbers[periodNumbers.length - 1] : null;

  const valueAt = (studentId, parameterId, periodNumber) => {
    const value = valueByKey.get(`${studentId}:${parameterId}:${periodNumber}`);
    return value === undefined ? null : value;
  };

  const cellAt = (studentId, parameterId, periodNumber) => {
    const value = valueAt(studentId, parameterId, periodNumber);
    const previous = valueAt(studentId, parameterId, periodNumber - 1);
    const delta = value !== null && previous !== null ? round(value - previous) : null;
    return { value, previous, delta };
  };

  const passes = (student, filter) => {
    const value = lastPeriod === null ? null : valueAt(student.id, filter.parameterId, lastPeriod);
    const has = value !== null;
    if (filter.op === 'missing') return !has;
    if (filter.op === 'present') return has;
    if (!has) return false;
    const compare = COMPARE[filter.op];
    return compare ? compare(value, filter.value) : true;
  };

  const filteredStudents = students.filter((student) =>
    filters.every((filter) => passes(student, filter))
  );

  return {
    periods,
    parameters,
    students: filteredStudents,
    periodNumbers,
    lastPeriod,
    valueAt,
    cellAt,
  };
}

// Cohort average of one parameter across every period in the cube: one point
// per period carrying the mean of all (filtered) students' values that period
// and the count behind it. Missing values are skipped; a period with no scores
// yields `average: null`, `count: 0`. Feeds the trend and comparison charts.
export function cohortAverages(cube, parameterId) {
  return cube.periods.map((period) => {
    const values = cubeValues(cube, parameterId, period.number);
    const average = values.length
      ? round(values.reduce((total, value) => total + value, 0) / values.length)
      : null;
    return { periodNumber: period.number, average, count: values.length };
  });
}

// Every non-null value recorded for a parameter in one period, across the cube's
// (filtered) students. Feeds the distribution chart.
export function cubeValues(cube, parameterId, periodNumber) {
  const values = [];
  for (const student of cube.students) {
    const value = cube.valueAt(student.id, parameterId, periodNumber);
    if (value !== null) values.push(value);
  }
  return values;
}
