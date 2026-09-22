import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ENTRIES, validateShape } from '../src/lib/evaluationCheck.js';
import { previewCells, previewCounts } from '../src/lib/scorePreview.js';

const S1 = '11111111-1111-4111-8111-111111111111';
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const at = '2026-10-01T10:00:00.000Z';
const existing = new Map([
  ['s1:p', { value: 7, isLocked: false, lockedAt: at }],
  ['s2:p', { value: 5, isLocked: true, lockedAt: at }],
  ['s3:p', { value: null, isLocked: false, lockedAt: at }],
  ['s4:p', { value: null, isLocked: true, lockedAt: at }],
]);
const entry = (studentId, value) => ({ studentId, parameterId: 'p', value });
const preview = (entries, problemIndexes = new Set()) =>
  previewCells({ entries, existing, problemIndexes });

test('a cell is new, changed, unchanged or locked depending on what exists', () => {
  const cells = preview([
    entry('s1', 8),
    entry('s1', 7),
    entry('s2', 6),
    entry('s2', 5),
    entry('s3', 4),
    entry('s4', 4),
    entry('s5', 3),
    entry('s5', null),
    entry('s1', null),
  ]);
  assert.deepEqual(
    cells.map((cell) => cell.status),
    ['change', 'unchanged', 'locked', 'unchanged', 'new', 'locked', 'new', 'unchanged', 'change']
  );
  assert.deepEqual([cells[0].from, cells[0].to], [7, 8]);
  assert.equal(cells[2].lockedAt, at);
  assert.equal(cells[4].from, null);
});

test('cells with problems are left out of the preview', () => {
  const cells = preview([entry('s1', 8), entry('s3', 4)], new Set([0]));
  assert.deepEqual(
    cells.map((cell) => [cell.index, cell.studentId]),
    [[1, 's3']]
  );
});

test('counts summarise the preview', () => {
  const cells = preview([entry('s1', 8), entry('s1', 7), entry('s2', 6), entry('s3', 4)]);
  assert.deepEqual(previewCounts(cells, [{ index: 9 }, { index: 10 }]), {
    new: 1,
    change: 1,
    unchanged: 1,
    locked: 1,
    save: 0,
    problems: 2,
  });
});

test('a blind-entry preview redacts existing values and never reveals them', () => {
  // scores.enter without scores.view: canViewScores is false.
  const cells = previewCells({
    entries: [
      entry('s1', 8), // s1 has 7 → would be a change
      entry('s1', 7), // equals existing → would be unchanged
      entry('s2', 6), // s2 is locked
      entry('s3', 4), // s3 is empty → would be new
    ],
    existing,
    problemIndexes: new Set(),
    canViewScores: false,
  });

  // Every non-locked cell collapses to the neutral 'save'; locked stays locked.
  assert.deepEqual(
    cells.map((cell) => cell.status),
    ['save', 'save', 'locked', 'save']
  );
  // The existing value is never sent back, for any cell.
  assert.ok(cells.every((cell) => cell.from === null));
  // Not even the lock timestamp leaks (it would hint a value exists).
  assert.ok(cells.every((cell) => !('lockedAt' in cell)));
  // The typed value the user is about to write is still echoed for confirmation.
  assert.deepEqual(
    cells.map((cell) => cell.to),
    [8, 7, 6, 4]
  );
});

test('redacted counts bucket writes under save, not new/change/unchanged', () => {
  const cells = previewCells({
    entries: [entry('s1', 8), entry('s3', 4), entry('s2', 6)],
    existing,
    problemIndexes: new Set(),
    canViewScores: false,
  });
  assert.deepEqual(previewCounts(cells, []), {
    new: 0,
    change: 0,
    unchanged: 0,
    locked: 1,
    save: 2,
    problems: 0,
  });
});

test('one import may carry up to 5000 cells', () => {
  assert.equal(MAX_ENTRIES, 5000);
  const make = (count) =>
    Array.from({ length: count }, (_, i) => ({
      studentId: S1,
      parameterId: P1,
      value: i,
    }));
  assert.equal(validateShape(make(5000)), null);
  assert.ok(validateShape(make(5001)));
});