import './_env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFullName,
  normalizeBirthdate,
  normalizeGender,
} from '../src/validation/student.js';
import { parseParameterInput } from '../src/validation/parameter.js';

test('normalizeFullName trims, collapses whitespace, and bounds length', () => {
  assert.equal(normalizeFullName('  Jane   Doe ').value, 'Jane Doe');
  assert.ok(normalizeFullName('a').error);
  assert.ok(normalizeFullName('x'.repeat(101)).error);
  assert.ok(normalizeFullName(5).error);
});

test('normalizeBirthdate requires a real calendar date in 1900..2100', () => {
  assert.equal(normalizeBirthdate('2000-01-15').value, '2000-01-15');
  assert.ok(normalizeBirthdate('2000-02-30').error); // not a real date
  assert.ok(normalizeBirthdate('1899-12-31').error); // before 1900
  assert.ok(normalizeBirthdate('nope').error);
});

test('normalizeGender is free text, 1-40 chars', () => {
  assert.equal(normalizeGender('  Non-binary ').value, 'Non-binary');
  assert.ok(normalizeGender('').error);
  assert.ok(normalizeGender('x'.repeat(41)).error);
  assert.ok(normalizeGender(null).error);
});

test('parseParameterInput requires a name unless partial', () => {
  assert.equal(parseParameterInput({ name: '  Blood  Pressure ' }).values.name, 'Blood Pressure');
  assert.ok(parseParameterInput({}).error);
  assert.deepEqual(parseParameterInput({ unit: 'kg' }, { partial: true }).values, { unit: 'kg' });
});

test('parseParameterInput normalises parent, numbers, and ranges', () => {
  assert.equal(parseParameterInput({ name: 'x', parentId: '' }).values.parentId, null);
  assert.ok(parseParameterInput({ name: 'x', parentId: 'bad' }).error);
  assert.equal(parseParameterInput({ name: 'x', minValue: '3' }).values.minValue, 3);
  assert.ok(parseParameterInput({ name: 'x', minValue: 'abc' }).error);
  assert.ok(parseParameterInput({ name: 'x', minValue: 10, maxValue: 5 }).error);
  assert.ok(parseParameterInput({ name: 'x', normMin: 9, normMax: 1 }).error);
  assert.ok(parseParameterInput({ name: 'x', sortOrder: 1.5 }).error);
});
