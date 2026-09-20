import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PERIOD,
  isValidPeriodNumber,
  parametersUsedInPeriod,
} from '../src/lib/parameterUse.js';

const changes = [
  { parameterId: 'speed', periodNumber: 1, scope: 'from_here_on', action: 'add' },
  { parameterId: 'rhythm', periodNumber: 1, scope: 'from_here_on', action: 'add' },
  { parameterId: 'rhythm', periodNumber: 10, scope: 'from_here_on', action: 'remove' },
  { parameterId: 'balance', periodNumber: 5, scope: 'from_here_on', action: 'add' },
  { parameterId: 'balance', periodNumber: 7, scope: 'this_period_only', action: 'remove' },
];

const ids = (log, n) => parametersUsedInPeriod(log, n).sort();

test('the example log gives the expected parameters for each period', () => {
  assert.deepEqual(ids(changes, 1), ['rhythm', 'speed']);
  assert.deepEqual(ids(changes, 4), ['rhythm', 'speed']);
  assert.deepEqual(ids(changes, 5), ['balance', 'rhythm', 'speed']);
  assert.deepEqual(ids(changes, 6), ['balance', 'rhythm', 'speed']);
  assert.deepEqual(ids(changes, 7), ['rhythm', 'speed']);
  assert.deepEqual(ids(changes, 8), ['balance', 'rhythm', 'speed']);
  assert.deepEqual(ids(changes, 9), ['balance', 'rhythm', 'speed']);
  assert.deepEqual(ids(changes, 10), ['balance', 'speed']);
  assert.deepEqual(ids(changes, 50), ['balance', 'speed']);
});

test('a parameter can be dropped and later added back', () => {
  const log = [
    ...changes,
    { parameterId: 'rhythm', periodNumber: 14, scope: 'from_here_on', action: 'add' },
  ];
  assert.deepEqual(ids(log, 13), ['balance', 'speed']);
  assert.deepEqual(ids(log, 14), ['balance', 'rhythm', 'speed']);
});

test('a one-period addition applies to that period only', () => {
  const log = [
    { parameterId: 'extra', periodNumber: 3, scope: 'this_period_only', action: 'add' },
  ];
  assert.deepEqual(ids(log, 2), []);
  assert.deepEqual(ids(log, 3), ['extra']);
  assert.deepEqual(ids(log, 4), []);
});

test('a one-period addition works inside a removed stretch', () => {
  const log = [
    { parameterId: 'p', periodNumber: 1, scope: 'from_here_on', action: 'add' },
    { parameterId: 'p', periodNumber: 10, scope: 'from_here_on', action: 'remove' },
    { parameterId: 'p', periodNumber: 12, scope: 'this_period_only', action: 'add' },
  ];
  assert.deepEqual(ids(log, 11), []);
  assert.deepEqual(ids(log, 12), ['p']);
  assert.deepEqual(ids(log, 13), []);
});

test('a change planned for a future period does not affect earlier ones', () => {
  const log = [
    { parameterId: 'p', periodNumber: 20, scope: 'from_here_on', action: 'add' },
  ];
  assert.deepEqual(ids(log, 19), []);
  assert.deepEqual(ids(log, 20), ['p']);
});

test('with no changes, nothing is used', () => {
  assert.deepEqual(ids([], 1), []);
});

test('period numbers must be whole numbers within range', () => {
  assert.equal(isValidPeriodNumber(1), true);
  assert.equal(isValidPeriodNumber(MAX_PERIOD), true);
  assert.equal(isValidPeriodNumber(0), false);
  assert.equal(isValidPeriodNumber(1.5), false);
  assert.equal(isValidPeriodNumber(MAX_PERIOD + 1), false);
  assert.equal(isValidPeriodNumber('3'), false);
});