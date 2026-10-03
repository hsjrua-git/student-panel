import { buildHistory, visibleRows } from './history.js';
import { changeOf } from './resultsView.js';
import { describeAudit, CATEGORY_OPTIONS } from './audit.js';

// A custom-field value as it should read in a CSV cell.
function fieldCsvValue(definition, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (definition.fieldType === 'yes_no') {
    if (raw === true) return 'Yes';
    if (raw === false) return 'No';
    return null;
  }
  return raw;
}

export function studentsCsvRows(students, fields = []) {
  const header = ['Student code', 'Full name', 'Added (UTC date)'];
  for (const field of fields) header.push(field.label);

  const body = students.map((student) => {
    const cells = [
      student.studentCode,
      student.fullName,
      student.createdAt.slice(0, 10),
    ];
    for (const field of fields) {
      cells.push(fieldCsvValue(field, student.extra?.[field.id]));
    }
    return cells;
  });
  return [header, ...body];
}

export function createdStudentsCsvRows(created) {
  return [
    ['Row', 'Student code', 'Full name'],
    ...created.map((student) => [
      student.row,
      student.studentCode,
      student.fullName,
    ]),
  ];
}

export function resultsCsvRows({ periodNumber, columns, rows, showChange }) {
  const withChange = showChange && periodNumber > 1;

  const header = ['Period', 'Student code', 'Full name'];
  for (const parameter of columns) {
    header.push(parameter.name);
    if (withChange) header.push(`${parameter.name} (change vs previous period)`);
  }

  const body = rows.map((row) => {
    const cells = [periodNumber, row.studentCode, row.fullName];
    for (const parameter of columns) {
      cells.push(row.values[parameter.id] ?? null);
      if (withChange) cells.push(changeOf(row, parameter.id));
    }
    return cells;
  });
  return [header, ...body];
}

export function historyCsvRows({ evaluations, periods, parameters }) {
  const history = buildHistory({ evaluations, periods, parameters });
  const rows = visibleRows(history.rows, evaluations, false);

  const header = [
    'Period',
    'Start date',
    'End date',
    ...history.columns.map((column) => column.name),
  ];
  const body = rows.map((row) => [
    row.periodNumber,
    row.startDate,
    row.endDate,
    ...history.columns.map((column) => {
      const cell = row.cells[column.id];
      return cell.state === 'value' ? cell.value : null;
    }),
  ]);
  return [header, ...body];
}
export function scoreTemplateCsvRows({ students, parameters }) {
  return [
    ['Student code', 'Full name', ...parameters.map((parameter) => parameter.name)],
    ...students.map((student) => [
      student.studentCode,
      student.fullName,
      ...parameters.map(() => null),
    ]),
  ];
}

// --- Export Center: cube-backed row builders ------------------------------
// These consume a cube from `lib/cube.js` (its `.periods`, `.parameters`,
// `.students`, `valueAt` and `cellAt`) and produce plain 2-D arrays suitable
// for `toCsv`, the xlsx writer, or JSON. They are pure and framework-free.

// "Long" (tidy) shape: one row per observed score — a period × student ×
// parameter cell that actually has a value. Cells with no value are skipped so
// the file carries observations, not a sparse grid.
export function cubeLongRows(cube, { includeDelta = false } = {}) {
  const header = [
    'Period',
    'Start date',
    'End date',
    'Student code',
    'Full name',
    'Parameter',
    'Value',
    ...(includeDelta ? ['Change vs previous period'] : []),
  ];
  const body = [];
  for (const period of cube.periods) {
    for (const student of cube.students) {
      for (const parameter of cube.parameters) {
        const cell = cube.cellAt(student.id, parameter.id, period.number);
        if (cell.value === null) continue;
        body.push([
          period.number,
          period.startDate,
          period.endDate,
          student.studentCode,
          student.fullName,
          parameter.name,
          cell.value,
          ...(includeDelta ? [cell.delta] : []),
        ]);
      }
    }
  }
  return [header, ...body];
}

// Shared matrix shape for the "wide" builders: one row per period × student,
// one column per parameter. `valueFor` returns the cell content; a row is
// emitted only when at least one column is non-null, so periods (or students)
// with nothing to show don't produce all-empty lines.
function cubeMatrixRows(cube, valueFor) {
  const header = [
    'Period',
    'Start date',
    'End date',
    'Student code',
    'Full name',
    ...cube.parameters.map((parameter) => parameter.name),
  ];
  const body = [];
  for (const period of cube.periods) {
    for (const student of cube.students) {
      const values = cube.parameters.map((parameter) =>
        valueFor(student.id, parameter.id, period.number)
      );
      if (values.every((value) => value === null)) continue;
      body.push([
        period.number,
        period.startDate,
        period.endDate,
        student.studentCode,
        student.fullName,
        ...values,
      ]);
    }
  }
  return [header, ...body];
}

// "Wide" matrix of raw values.
export function cubeWideRows(cube) {
  return cubeMatrixRows(cube, (studentId, parameterId, periodNumber) =>
    cube.valueAt(studentId, parameterId, periodNumber)
  );
}

// "Wide" matrix of period-over-period deltas (value − previous period's value).
export function deltaRows(cube) {
  return cubeMatrixRows(
    cube,
    (studentId, parameterId, periodNumber) =>
      cube.cellAt(studentId, parameterId, periodNumber).delta
  );
}

const SCOPE_LABELS = {
  from_here_on: 'From this period on',
  this_period_only: 'This period only',
};
const ACTION_LABELS = { add: 'Added', remove: 'Removed' };

// The parameter tracking / activation log: each row is one change to when a
// parameter is in use. `changes` is the shape from GET /api/parameter-changes
// (it already carries `parameterName`); an optional id→parameter map lets a
// caller override the label. Ordering is preserved from the caller.
export function trackingLogRows(changes, parametersById = null) {
  const header = ['Parameter', 'Period', 'Scope', 'Action', 'Recorded (UTC)'];
  const body = changes.map((change) => [
    parametersById?.get(change.parameterId)?.name ??
      change.parameterName ??
      change.parameterId,
    change.periodNumber,
    SCOPE_LABELS[change.scope] ?? change.scope,
    ACTION_LABELS[change.action] ?? change.action,
    change.createdAt ?? null,
  ]);
  return [header, ...body];
}

const CATEGORY_LABELS = new Map(
  CATEGORY_OPTIONS.filter((option) => option.value).map((option) => [
    option.value,
    option.label,
  ])
);

// The full edit audit trail. `entries` is the shape from GET /api/audit; the
// human-readable description reuses `describeAudit` so the file reads exactly
// like the Audit page.
export function auditTrailRows(entries) {
  const header = ['When (UTC)', 'User', 'Category', 'Action', 'Description'];
  const body = entries.map((entry) => {
    const category = entry.action.split('.')[0];
    return [
      entry.occurredAt ?? null,
      entry.actor ?? null,
      CATEGORY_LABELS.get(category) ?? category,
      entry.action,
      describeAudit(entry),
    ];
  });
  return [header, ...body];
}

// A structured, serialisable view of the cube for JSON export. The caller
// stringifies (e.g. `JSON.stringify(cubeJson(cube), null, 2)`); returning the
// object keeps this pure and easy to assert on in tests. Per student, only the
// periods that carry a value or a delta are included.
export function cubeJson(cube, { scope = null } = {}) {
  return {
    scope,
    periods: cube.periods,
    parameters: cube.parameters,
    students: cube.students.map((student) => ({
      id: student.id,
      fullName: student.fullName,
      studentCode: student.studentCode,
      periods: cube.periods
        .map((period) => {
          const values = {};
          for (const parameter of cube.parameters) {
            const cell = cube.cellAt(student.id, parameter.id, period.number);
            if (cell.value === null && cell.delta === null) continue;
            values[parameter.id] = {
              value: cell.value,
              previous: cell.previous,
              delta: cell.delta,
            };
          }
          return { period: period.number, values };
        })
        .filter((entry) => Object.keys(entry.values).length > 0),
    })),
  };
}