import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEntries,
  cellAccess,
  cellKey,
  lockedDraftKeys,
  parseCell,
  savedText,
} from '../src/lib/cells.js';

const speed = { minValue: 0, maxValue: 10 };
const open = { minValue: null, maxValue: null };

test('empty text clears the cell', () => {
  assert.deepEqual(parseCell('', speed), { value: null });
  assert.deepEqual(parseCell('   ', speed), { value: null });
});

test('accepts plain numbers, including a decimal comma', () => {
  assert.deepEqual(parseCell('7', speed), { value: 7 });
  assert.deepEqual(parseCell('6.5', speed), { value: 6.5 });
  assert.deepEqual(parseCell('6,5', speed), { value: 6.5 });
  assert.deepEqual(parseCell(' 0 ', speed), { value: 0 });
  assert.deepEqual(parseCell('-3', open), { value: -3 });
});

test('rejects things that are not plain numbers', () => {
  for (const text of ['abc', '1e3', '0x10', '5 5', '--1', '.', '7%']) {
    assert.ok(parseCell(text, open).error, `${text} should be rejected`);
  }
});

test('enforces the range', () => {
  assert.equal(parseCell('11', speed).error, 'At most 10.');
  assert.equal(parseCell('-1', speed).error, 'At least 0.');
  assert.deepEqual(parseCell('10', speed), { value: 10 });
});

test('builds entries and collects errors per cell', () => {
  const parameters = new Map([['p1', speed]]);
  const drafts = {
    [cellKey('s1', 'p1')]: '8',
    [cellKey('s2', 'p1')]: '15',
    [cellKey('s3', 'p1')]: '',
  };
  const { entries, errors } = buildEntries(drafts, parameters);
  assert.deepEqual(entries, [
    { studentId: 's1', parameterId: 'p1', value: 8 },
    { studentId: 's3', parameterId: 'p1', value: null },
  ]);
  assert.deepEqual(errors, { 's2:p1': 'At most 10.' });
});

test('saved values are shown as plain text', () => {
  assert.equal(savedText(7), '7');
  assert.equal(savedText(6.5), '6.5');
  assert.equal(savedText(undefined), '');
  assert.equal(savedText(null), '');
});
test('locked cells are read-only for everyone except administrators', () => {
  const locked = { isLocked: true, lockedAt: '2026-10-01T10:00:00Z' };
  const open = { isLocked: false, lockedAt: '2026-10-08T10:00:00Z' };
  assert.equal(cellAccess(undefined, false), 'open');
  assert.equal(cellAccess(open, false), 'open');
  assert.equal(cellAccess(locked, false), 'locked');
  assert.equal(cellAccess(locked, true), 'override');
});

test('finds which drafted cells are locked', () => {
  const locks = { 'a:p': { isLocked: true }, 'b:p': { isLocked: false } };
  assert.deepEqual(
    lockedDraftKeys({ 'a:p': '5', 'b:p': '6', 'c:p': '7' }, locks),
    ['a:p']
  );
  assert.deepEqual(lockedDraftKeys({}, locks), []);
});