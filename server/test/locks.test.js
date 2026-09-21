import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findLockedChanges,
  lockDaysFor,
  parseOverrideReason,
} from '../src/lib/locks.js';

test('scores entered in their own period lock after 7 days, late ones after 1', () => {
  assert.equal(lockDaysFor({ periodNumber: 12, currentPeriod: 12 }), 7);
  assert.equal(lockDaysFor({ periodNumber: 11, currentPeriod: 12 }), 1);
  assert.equal(lockDaysFor({ periodNumber: 1, currentPeriod: 30 }), 1);
});

const at = new Date('2026-10-01T10:00:00Z');
const existing = new Map([
  ['s1:speed', { value: 7, isLocked: true, lockedAt: at }],
  ['s2:speed', { value: 5, isLocked: false, lockedAt: at }],
  ['s3:speed', { value: null, isLocked: true, lockedAt: at }],
]);
const entry = (studentId, value) => ({ studentId, parameterId: 'speed', value });

test('changes to locked scores are flagged', () => {
  const flagged = findLockedChanges({
    entries: [entry('s1', 8), entry('s2', 9), entry('s4', 3)],
    existing,
  });
  assert.deepEqual(
    flagged.map((item) => [item.index, item.studentId]),
    [[0, 's1']]
  );
});

test('unchanged locked scores and open scores are not flagged', () => {
  assert.deepEqual(
    findLockedChanges({ entries: [entry('s1', 7), entry('s3', null)], existing }),
    []
  );
});

test('filling or clearing a locked score counts as a change', () => {
  const flagged = findLockedChanges({
    entries: [entry('s3', 4), entry('s1', null)],
    existing,
  });
  assert.deepEqual(
    flagged.map((item) => item.studentId),
    ['s3', 's1']
  );
});

test('override reasons are trimmed and length-checked', () => {
  assert.deepEqual(parseOverrideReason('  Corrected   after review '), {
    value: 'Corrected after review',
  });
  assert.ok(parseOverrideReason('abc').error);
  assert.ok(parseOverrideReason('x'.repeat(301)).error);
  assert.ok(parseOverrideReason(undefined).error);
  assert.ok(parseOverrideReason('     ').error);
});