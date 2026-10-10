import './_env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cellKey,
  parseValue,
  parseComment,
  groupAndAncestorIds,
  applicableParameterIds,
  MAX_COMMENT,
} from '../src/lib/evaluations.js';

test('cellKey uses the group sentinel when there is no student', () => {
  assert.equal(cellKey(null, 'p'), 'group:p');
  assert.equal(cellKey('s1', 'p'), 's1:p');
});

test('parseValue accepts numbers, numeric strings, and blanks', () => {
  assert.deepEqual(parseValue(null), { value: null });
  assert.deepEqual(parseValue(''), { value: null });
  assert.deepEqual(parseValue(undefined), { value: null });
  assert.deepEqual(parseValue(5), { value: 5 });
  assert.deepEqual(parseValue('3.5'), { value: 3.5 });
});

test('parseValue rejects non-numbers and non-finite values', () => {
  assert.ok(parseValue('abc').error);
  assert.ok(parseValue('   ').error);
  assert.ok(parseValue(NaN).error);
  assert.ok(parseValue(Infinity).error);
});

test('parseComment clears, keeps, and bounds the text', () => {
  assert.deepEqual(parseComment(null), { value: null });
  assert.deepEqual(parseComment(''), { value: null });
  assert.deepEqual(parseComment('ok'), { value: 'ok' });
  assert.ok(parseComment(5).error);
  assert.ok(parseComment('x'.repeat(MAX_COMMENT + 1)).error);
});

test('groupAndAncestorIds walks parents and guards cycles', () => {
  const parentById = new Map([['d', 'b'], ['b', 'a'], ['a', null]]);
  assert.deepEqual(groupAndAncestorIds(parentById, 'd'), ['d', 'b', 'a']);
  assert.deepEqual(groupAndAncestorIds(new Map([['x', 'y'], ['y', 'x']]), 'x'), ['x', 'y']);
});

const assignments = [
  { parameterId: 'pg', groupId: 'g1', studentId: null },
  { parameterId: 'ps', groupId: null, studentId: 's1' },
  { parameterId: 'pother', groupId: 'g9', studentId: null },
];
const allParamIds = ['pfree', 'pg', 'ps', 'pother'];

test('applicableParameterIds: unassigned params are global, assigned ones must match', () => {
  const got = applicableParameterIds(assignments, allParamIds, { groupIds: ['g1'], studentId: 's1' });
  assert.deepEqual([...got].sort(), ['pfree', 'pg', 'ps']);
});

test('applicableParameterIds: a student-only assignment is excluded without that student', () => {
  const got = applicableParameterIds(assignments, allParamIds, { groupIds: ['g1'] });
  assert.deepEqual([...got].sort(), ['pfree', 'pg']);
});
