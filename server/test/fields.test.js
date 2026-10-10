import './_env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFieldValue,
  validateExtra,
  stripRestricted,
} from '../src/lib/fields.js';

test('validateFieldValue clears blanks for any type', () => {
  assert.deepEqual(validateFieldValue({ fieldType: 'text', label: 'T' }, ''), { value: null });
  assert.deepEqual(validateFieldValue({ fieldType: 'number', label: 'N' }, null), { value: null });
});

test('validateFieldValue checks each field type', () => {
  assert.equal(validateFieldValue({ fieldType: 'text', label: 'T' }, '  hi  ').value, 'hi');
  assert.ok(validateFieldValue({ fieldType: 'text', label: 'T' }, 'x'.repeat(201)).error);
  assert.equal(validateFieldValue({ fieldType: 'number', label: 'N' }, '3.5').value, 3.5);
  assert.ok(validateFieldValue({ fieldType: 'number', label: 'N' }, 'abc').error);
  assert.equal(validateFieldValue({ fieldType: 'date', label: 'D' }, '2020-02-29').value, '2020-02-29');
  assert.ok(validateFieldValue({ fieldType: 'date', label: 'D' }, '2021-02-29').error);
  assert.equal(validateFieldValue({ fieldType: 'yes_no', label: 'Y' }, true).value, true);
  assert.ok(validateFieldValue({ fieldType: 'yes_no', label: 'Y' }, 'yes').error);
  assert.equal(validateFieldValue({ fieldType: 'choice', label: 'C', choices: ['a', 'b'] }, 'b').value, 'b');
  assert.ok(validateFieldValue({ fieldType: 'choice', label: 'C', choices: ['a'] }, 'z').error);
});

const defs = [
  { id: 'f-text', fieldType: 'text', label: 'Text' },
  { id: 'f-num', fieldType: 'number', label: 'Num' },
];

test('validateExtra rejects non-objects and unknown keys, drops cleared values', () => {
  assert.ok(validateExtra(defs, []).error);
  assert.ok(validateExtra(defs, null).error);
  assert.ok(validateExtra(defs, { ghost: 'x' }).error);
  assert.deepEqual(validateExtra(defs, { 'f-text': 'hi', 'f-num': '3' }).value, { 'f-text': 'hi', 'f-num': 3 });
  assert.deepEqual(validateExtra(defs, { 'f-text': '' }).value, {});
});

const rdefs = [
  { id: 'r1', isRestricted: true },
  { id: 'ok', isRestricted: false },
];

test('stripRestricted hides restricted ids unless allowed', () => {
  assert.deepEqual(stripRestricted(rdefs, { r1: 's', ok: 'v' }, false), { ok: 'v' });
  assert.deepEqual(stripRestricted(rdefs, { r1: 's', ok: 'v' }, true), { r1: 's', ok: 'v' });
  assert.deepEqual(stripRestricted(rdefs, null, false), {});
});
