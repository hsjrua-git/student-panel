import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResults } from '../src/lib/results.js';

const speed = { id: 'speed', name: 'Speed', unit: null, minValue: 0, maxValue: 10 };
const balance = { id: 'balance', name: 'Balance', unit: null, minValue: null, maxValue: null };
const old = { id: 'old', name: 'Old', unit: null, minValue: null, maxValue: null };
const ghost = { id: 'ghost', name: 'Ghost', unit: null, minValue: null, maxValue: null };
const parameters = [speed, balance, old, ghost];

const students = [
  { id: 's1', fullName: 'Ana', studentCode: 'AAAAAAAA' },
  { id: 's2', fullName: 'Ben', studentCode: 'BBBBBBBB' },
  { id: 's3', fullName: 'Cleo', studentCode: 'CCCCCCCC' },
];

const evaluations = [
  { studentId: 's1', parameterId: 'speed', periodNumber: 5, value: 7 },
  { studentId: 's1', parameterId: 'speed', periodNumber: 4, value: 6 },
  { studentId: 's2', parameterId: 'speed', periodNumber: 4, value: 3 },
  { studentId: 's2', parameterId: 'old', periodNumber: 5, value: 2 },
  { studentId: 'gone', parameterId: 'ghost', periodNumber: 5, value: 9 },
  { studentId: 's1', parameterId: 'speed', periodNumber: 2, value: 1 },
];

const usedIds = new Set(['speed', 'balance']);

test('current and previous scores are separated; other periods are ignored', () => {
  const result = buildResults({ periodNumber: 5, parameters, usedIds, students, evaluations });
  assert.deepEqual(result.students[0], {
    id: 's1',
    fullName: 'Ana',
    studentCode: 'AAAAAAAA',
    values: { speed: 7 },
    previous: { speed: 6 },
  });
  assert.deepEqual(result.students[1].values, { old: 2 });
  assert.deepEqual(result.students[1].previous, { speed: 3 });
});

test('parameters in use are shown, plus ones with scores; scores of deleted students do not count', () => {
  const result = buildResults({ periodNumber: 5, parameters, usedIds, students, evaluations });
  assert.deepEqual(
    result.parameters.map((p) => [p.id, p.inUse]),
    [
      ['speed', true],
      ['balance', true],
      ['old', false],
    ]
  );
});

test('period 1 has no previous scores and students without scores have empty rows', () => {
  const result = buildResults({
    periodNumber: 1,
    parameters,
    usedIds,
    students,
    evaluations: [{ studentId: 's1', parameterId: 'speed', periodNumber: 1, value: 8 }],
  });
  assert.deepEqual(result.students[0].values, { speed: 8 });
  assert.deepEqual(result.students[0].previous, {});
  assert.deepEqual(result.students[2], {
    id: 's3',
    fullName: 'Cleo',
    studentCode: 'CCCCCCCC',
    values: {},
    previous: {},
  });
});