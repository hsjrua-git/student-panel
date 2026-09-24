import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleHidden, visibleParameters } from '../src/lib/prefs.js';
import { normalizePalette, normalizeTheme } from '../src/lib/theme.js';

test('themes are normalised to a known value', () => {
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('system'), 'system');
  assert.equal(normalizeTheme('blue'), 'system');
  assert.equal(normalizeTheme(null), 'system');
  assert.equal(normalizeTheme(undefined), 'system');
});

test('palettes are normalised to a known value, falling back to gradebook', () => {
  assert.equal(normalizePalette('midnight'), 'midnight');
  assert.equal(normalizePalette('ember'), 'ember');
  assert.equal(normalizePalette('meadow'), 'meadow');
  assert.equal(normalizePalette('gradebook'), 'gradebook');
  assert.equal(normalizePalette('indigo'), 'gradebook');
  assert.equal(normalizePalette(null), 'gradebook');
  assert.equal(normalizePalette(undefined), 'gradebook');
});

test('hidden parameters are left out of the visible list', () => {
  const parameters = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(
    visibleParameters(parameters, ['b']).map((p) => p.id),
    ['a', 'c']
  );
  assert.deepEqual(visibleParameters(parameters, []).length, 3);
});

test('hiding and showing a parameter never creates duplicates', () => {
  assert.deepEqual(toggleHidden([], 'a', false), ['a']);
  assert.deepEqual(toggleHidden(['a'], 'a', false), ['a']);
  assert.deepEqual(toggleHidden(['a', 'b'], 'a', true), ['b']);
  assert.deepEqual(toggleHidden(['b'], 'a', true), ['b']);
});