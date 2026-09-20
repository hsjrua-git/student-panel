import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hiddenScores, withChange } from '../src/lib/parameterUse.js';

const start = {
  parameterId: 'p',
  periodNumber: 1,
  scope: 'from_here_on',
  action: 'add',
};
const counts = [
  { periodNumber: 4, count: 2 },
  { periodNumber: 6, count: 3 },
  { periodNumber: 8, count: 1 },
];

function remove(periodNumber, scope) {
  return { parameterId: 'p', periodNumber, scope, action: 'remove' };
}

test('removing from a period on hides scores from that period onward', () => {
  assert.deepEqual(
    hiddenScores({
      changes: [start],
      change: remove(6, 'from_here_on'),
      scoreCounts: counts,
    }),
    { affectedScores: 4, periods: [6, 8] }
  );
});

test('removing for one period only hides just that period', () => {
  assert.deepEqual(
    hiddenScores({
      changes: [start],
      change: remove(6, 'this_period_only'),
      scoreCounts: counts,
    }),
    { affectedScores: 3, periods: [6] }
  );
});

test('adding never hides scores', () => {
  const add = {
    parameterId: 'p',
    periodNumber: 3,
    scope: 'this_period_only',
    action: 'add',
  };
  assert.deepEqual(
    hiddenScores({ changes: [start], change: add, scoreCounts: counts }),
    { affectedScores: 0, periods: [] }
  );
});

test('nothing is hidden when the parameter is already unused there', () => {
  const changes = [start, remove(5, 'from_here_on')];
  assert.deepEqual(
    hiddenScores({
      changes,
      change: remove(7, 'from_here_on'),
      scoreCounts: [{ periodNumber: 8, count: 4 }],
    }),
    { affectedScores: 0, periods: [] }
  );
});

test('a later re-add keeps its periods visible', () => {
  const readd = {
    parameterId: 'p',
    periodNumber: 8,
    scope: 'from_here_on',
    action: 'add',
  };
  assert.deepEqual(
    hiddenScores({
      changes: [start, readd],
      change: remove(6, 'from_here_on'),
      scoreCounts: counts,
    }),
    { affectedScores: 3, periods: [6] }
  );
});

test('a new change replaces an existing one with the same period and scope', () => {
  const existing = remove(6, 'from_here_on');
  const add = {
    parameterId: 'p',
    periodNumber: 6,
    scope: 'from_here_on',
    action: 'add',
  };
  assert.deepEqual(withChange([start, existing], add), [start, add]);
  assert.deepEqual(
    hiddenScores({
      changes: [start, existing],
      change: add,
      scoreCounts: counts,
    }),
    { affectedScores: 0, periods: [] }
  );
});