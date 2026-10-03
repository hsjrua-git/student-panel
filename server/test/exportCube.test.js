import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCube } from '../src/lib/exportCube.js';

const speed = { id: 'speed', name: 'Speed', unit: null, minValue: 0, maxValue: 10 };
const balance = { id: 'balance', name: 'Balance', unit: null, minValue: null, maxValue: null };
const old = { id: 'old', name: 'Old', unit: null, minValue: null, maxValue: null };
const extra = { id: 'extra', name: 'Extra', unit: null, minValue: null, maxValue: null };
const parameters = [speed, balance, old, extra];

// speed comes into use from period 2; old is used only in period 1.
const changes = [
  { parameterId: 'speed', periodNumber: 2, scope: 'from_here_on', action: 'add' },
  { parameterId: 'old', periodNumber: 1, scope: 'from_here_on', action: 'add' },
  { parameterId: 'old', periodNumber: 2, scope: 'from_here_on', action: 'remove' },
];

const students = [
  { id: 's1', fullName: 'Ana', studentCode: 'AAAAAAAA' },
  { id: 's2', fullName: 'Ben', studentCode: 'BBBBBBBB' },
];

const evaluations = [
  { studentId: 's1', parameterId: 'speed', periodNumber: 1, value: 4 },
  { studentId: 's1', parameterId: 'speed', periodNumber: 2, value: 6 },
  { studentId: 's1', parameterId: 'speed', periodNumber: 3, value: 8 },
  { studentId: 's1', parameterId: 'balance', periodNumber: 3, value: 5 },
  { studentId: 's2', parameterId: 'old', periodNumber: 1, value: 2 },
  { studentId: 'gone', parameterId: 'speed', periodNumber: 3, value: 9 },
];

const periodDatesFor = (number) => ({
  startDate: `d${number}s`,
  endDate: `d${number}e`,
});

function build(overrides = {}) {
  return buildCube({
    periods: [2, 3],
    parameters,
    changes,
    students,
    evaluations,
    selectedParameterIds: null,
    periodDatesFor,
    ...overrides,
  });
}

test('"all" columns are parameters in use in, or scored in, the requested periods', () => {
  const cube = build();
  // speed (scored + in use) and balance (scored p3) show; old (only scored in
  // p1, out of the requested range) and extra (never touched) do not.
  assert.deepEqual(
    cube.parameters.map((p) => [p.id, p.inUse]),
    [
      ['speed', true],
      ['balance', false],
    ]
  );
});

test('cells keep period − 1 for deltas and drop non-roster students', () => {
  const cube = build();
  const keys = cube.cells
    .map((c) => `${c.studentId}:${c.parameterId}:${c.periodNumber}=${c.value}`)
    .sort();
  // s1 speed at period 1 is kept (it is the "previous" for period 2) even though
  // period 1 was not requested; the deleted "gone" student is dropped.
  assert.deepEqual(keys, [
    's1:balance:3=5',
    's1:speed:1=4',
    's1:speed:2=6',
    's1:speed:3=8',
  ]);
});

test('per-period parameterIds reflect what is in use that period among the columns', () => {
  const cube = build();
  assert.deepEqual(
    cube.periods.map((p) => [p.number, p.startDate, p.parameterIds]),
    [
      [2, 'd2s', ['speed']],
      [3, 'd3s', ['speed']],
    ]
  );
});

test('an explicit parameter selection pins the columns regardless of relevance', () => {
  const cube = build({ selectedParameterIds: ['old'] });
  assert.deepEqual(
    cube.parameters.map((p) => p.id),
    ['old']
  );
  // Only the "old" cell survives, and it is period 1 (kept as previous for p2).
  assert.deepEqual(
    cube.cells.map((c) => `${c.studentId}:${c.parameterId}:${c.periodNumber}`),
    ['s2:old:1']
  );
  assert.deepEqual(cube.periods.map((p) => p.parameterIds), [[], []]);
});

test('the roster is returned in full and shaped to id/name/code', () => {
  const cube = build();
  assert.deepEqual(cube.students, [
    { id: 's1', fullName: 'Ana', studentCode: 'AAAAAAAA' },
    { id: 's2', fullName: 'Ben', studentCode: 'BBBBBBBB' },
  ]);
});
