import './_env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePreferencesUpdate,
  mergePreferences,
  DEFAULT_PREFERENCES,
} from '../src/lib/preferences.js';

const UUID = '11111111-1111-1111-1111-111111111111';

test('parsePreferencesUpdate rejects non-objects and unknown keys', () => {
  assert.ok(parsePreferencesUpdate(null).error);
  assert.ok(parsePreferencesUpdate([]).error);
  assert.ok(parsePreferencesUpdate({ nope: 1 }).error);
});

test('parsePreferencesUpdate rejects invalid values and empty bodies', () => {
  assert.ok(parsePreferencesUpdate({ theme: 'neon' }).error);
  assert.ok(parsePreferencesUpdate({ studentsPageSize: 999 }).error);
  assert.equal(parsePreferencesUpdate({}).error, 'Nothing to change.');
});

test('parsePreferencesUpdate keeps valid changes', () => {
  assert.deepEqual(
    parsePreferencesUpdate({ theme: 'light', hiddenParameterIds: [UUID] }),
    { values: { theme: 'light', hiddenParameterIds: [UUID] } }
  );
});

test('parsePreferencesUpdate validates the accent palette', () => {
  assert.deepEqual(parsePreferencesUpdate({ palette: 'cobalt' }), {
    values: { palette: 'cobalt' },
  });
  assert.ok(parsePreferencesUpdate({ palette: 'chartreuse' }).error);
});

test('mergePreferences falls back to defaults for null/invalid stored values', () => {
  assert.deepEqual(mergePreferences(null), { ...DEFAULT_PREFERENCES, hiddenParameterIds: [] });
  const merged = mergePreferences({ theme: 'light', studentsPageSize: 7, bogus: true });
  assert.equal(merged.theme, 'light'); // valid override
  assert.equal(merged.studentsPageSize, 25); // 7 invalid -> default
  assert.ok(!('bogus' in merged));
});
