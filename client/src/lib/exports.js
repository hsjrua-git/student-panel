import { buildHistory, visibleRows } from './history.js';
import { changeOf } from './resultsView.js';

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