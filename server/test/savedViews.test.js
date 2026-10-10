import './_env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseViewName, parseViewConfig } from '../src/lib/savedViews.js';

const P1 = '11111111-1111-1111-1111-111111111111';
const P2 = '22222222-2222-2222-2222-222222222222';
const G1 = '33333333-3333-3333-3333-333333333333';

test('parseViewName trims, collapses, and bounds length', () => {
  assert.equal(parseViewName('  My   View ').value, 'My View');
  assert.ok(parseViewName('').error);
  assert.ok(parseViewName('x'.repeat(61)).error);
  assert.ok(parseViewName(5).error);
});

test('parseViewConfig fills every default from an empty object', () => {
  assert.deepEqual(parseViewConfig({}).value, {
    groupId: null,
    periodId: null,
    parameterIds: [],
    filters: [],
    sort: { key: 'name', direction: 'asc' },
    search: '',
    showChange: false,
  });
});

test('parseViewConfig accepts a full valid config', () => {
  const got = parseViewConfig({
    groupId: G1,
    parameterIds: [P1, P2],
    filters: [{ parameterId: P1, op: 'gte', value: 5 }, { parameterId: P2, op: 'missing' }],
    sort: { key: P1, direction: 'desc' },
    search: '  jane ',
    showChange: true,
  });
  assert.equal(got.value.search, 'jane');
  assert.equal(got.value.filters.length, 2);
  assert.deepEqual(got.value.sort, { key: P1, direction: 'desc' });
});

test('parseViewConfig rejects bad ids, duplicate columns, and bad filters', () => {
  assert.ok(parseViewConfig(null).error);
  assert.ok(parseViewConfig([]).error);
  assert.ok(parseViewConfig({ groupId: 'nope' }).error);
  assert.ok(parseViewConfig({ parameterIds: [P1, P1] }).error);
  assert.ok(parseViewConfig({ filters: [{ parameterId: P1, op: 'gte' }] }).error); // value op needs a number
  assert.ok(parseViewConfig({ sort: { key: 'bogus', direction: 'asc' } }).error);
});
