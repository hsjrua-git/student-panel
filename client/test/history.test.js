import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHistory, visibleRows } from '../src/lib/history.js';

const speed = { id: 'speed', name: 'Speed' };
const balance = { id: 'balance', name: 'Balance' };
const neverUsed = { id: 'unused', name: 'Never used' };
const parameters = [speed, balance, neverUsed];

const periods = [
  { number: 1, startDate: '2026-09-19', endDate: '2026-09-25', parameterIds: ['speed'] },
  { number: 2, startDate: '2026-09-26', endDate: '2026-10-02', parameterIds: ['speed'] },
  {
    number: 3,
    startDate: '2026-10-03',
    endDate: '2026-10-09',
    parameterIds: ['speed', 'balance'],
  },
];

test('cells are values, missing (in use but not measured), or unused', () => {
  const evaluations = [
    { periodNumber: 1, parameterId: 'speed', value: 7 },
    { periodNumber: 3, parameterId: 'speed', value: 8 },
  ];
  const { columns, rows } = buildHistory({ evaluations, periods, parameters });

  assert.deepEqual(
    columns.map((column) => column.id),
    ['speed', 'balance']
  );
  assert.deepEqual(
    rows.map((row) => row.cells.speed),
    [{ state: 'value', value: 7 }, { state: 'missing' }, { state: 'value', value: 8 }]
  );
  assert.deepEqual(
    rows.map((row) => row.cells.balance.state),
    ['unused', 'unused', 'missing']
  );
});

test('a scored parameter that no period uses still gets a column', () => {
  const evaluations = [{ periodNumber: 2, parameterId: 'unused', value: 5 }];
  const { columns, rows } = buildHistory({ evaluations, periods, parameters });

  assert.deepEqual(
    columns.map((column) => column.id),
    ['speed', 'balance', 'unused']
  );
  assert.deepEqual(
    rows.map((row) => row.cells.unused.state),
    ['unused', 'value', 'unused']
  );
});

test('parameters that are never used and never scored are left out', () => {
  const { columns } = buildHistory({ evaluations: [], periods, parameters });
  assert.deepEqual(
    columns.map((column) => column.id),
    ['speed', 'balance']
  );
});

test('rows start at the first scored period unless everything is requested', () => {
  const evaluations = [{ periodNumber: 2, parameterId: 'speed', value: 5 }];
  const { rows } = buildHistory({ evaluations, periods, parameters });

  assert.deepEqual(
    visibleRows(rows, evaluations, false).map((row) => row.periodNumber),
    [2, 3]
  );
  assert.deepEqual(
    visibleRows(rows, evaluations, true).map((row) => row.periodNumber),
    [1, 2, 3]
  );
});

test('with no scores only the current period is shown', () => {
  const { rows } = buildHistory({ evaluations: [], periods, parameters });
  assert.deepEqual(
    visibleRows(rows, [], false).map((row) => row.periodNumber),
    [3]
  );
  assert.deepEqual(visibleRows([], [], false), []);
});