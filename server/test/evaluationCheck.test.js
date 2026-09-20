import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findProblems, validateShape } from '../src/lib/evaluationCheck.js';

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const SPEED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OPEN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const usedParameters = new Map([
  [SPEED, { id: SPEED, name: 'Speed', minValue: 0, maxValue: 10 }],
  [OPEN, { id: OPEN, name: 'Open scale', minValue: null, maxValue: null }],
]);
const knownStudentIds = new Set([S1, S2]);

function check(entries, periodNumber = 3) {
  return findProblems({ entries, usedParameters, knownStudentIds, periodNumber });
}

test('accepts valid entries, including the range limits', () => {
  assert.deepEqual(
    check([
      { studentId: S1, parameterId: SPEED, value: 0 },
      { studentId: S1, parameterId: OPEN, value: 10 },
      { studentId: S2, parameterId: SPEED, value: 10 },
    ]),
    []
  );
});

test('rejects values outside a parameter range', () => {
  const problems = check([
    { studentId: S1, parameterId: SPEED, value: 11 },
    { studentId: S2, parameterId: SPEED, value: -0.5 },
  ]);
  assert.deepEqual(
    problems.map((p) => [p.index, p.message]),
    [
      [0, 'Speed must be at most 10.'],
      [1, 'Speed must be at least 0.'],
    ]
  );
});

test('rejects a parameter that the period does not use', () => {
  const problems = check(
    [{ studentId: S1, parameterId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', value: 5 }],
    7
  );
  assert.deepEqual(
    problems.map((p) => p.message),
    ['This parameter is not used in Period 7.']
  );
});

test('rejects unknown students', () => {
  const problems = check([
    { studentId: '33333333-3333-4333-8333-333333333333', parameterId: SPEED, value: 5 },
  ]);
  assert.deepEqual(
    problems.map((p) => p.message),
    ['Student not found.']
  );
});

test('rejects the same student and parameter twice', () => {
  const problems = check([
    { studentId: S1, parameterId: SPEED, value: 5 },
    { studentId: S1, parameterId: SPEED, value: 6 },
  ]);
  assert.deepEqual(
    problems.map((p) => [p.index, p.message]),
    [[1, 'This student and parameter appear more than once.']]
  );
});

test('null clears a cell even when a range exists; open scales accept any number', () => {
  assert.deepEqual(
    check([
      { studentId: S1, parameterId: SPEED, value: null },
      { studentId: S1, parameterId: OPEN, value: 12345.5 },
    ]),
    []
  );
});

test('checks the shape of the request', () => {
  assert.equal(validateShape([{ studentId: S1, parameterId: SPEED, value: 5 }]), null);
  assert.equal(validateShape([{ studentId: S1, parameterId: SPEED, value: null }]), null);
  assert.notEqual(validateShape([]), null);
  assert.notEqual(validateShape('nope'), null);
  assert.notEqual(validateShape([{ studentId: 'x', parameterId: SPEED, value: 5 }]), null);
  assert.notEqual(validateShape([{ studentId: S1, parameterId: SPEED, value: '5' }]), null);
  assert.notEqual(validateShape([{ studentId: S1, parameterId: SPEED }]), null);
  assert.notEqual(validateShape([{ studentId: S1, parameterId: SPEED, value: 1e12 }]), null);
});