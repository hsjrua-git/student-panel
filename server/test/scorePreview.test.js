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
    problems: 2,
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