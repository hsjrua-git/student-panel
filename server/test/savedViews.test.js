import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRequest } from '../src/lib/auditRules.js';
import { parseViewConfig, parseViewName } from '../src/lib/savedViews.js';

const ID = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
const ID2 = '11111111-1111-4111-8111-111111111111';

const DEFAULTS = {
  periodMode: 'current',
  periodNumber: null,
  parameterIds: [],
  filters: [],
  sort: { key: 'name', direction: 'asc' },
  search: '',
  showChange: false,
};

test('a full valid view config is accepted and normalised', () => {
  const result = parseViewConfig({
    periodMode: 'fixed',
    periodNumber: 7,
    parameterIds: [ID],
    filters: [
      { parameterId: ID, op: 'lt', value: 5, extra: 'x' },
      { parameterId: ID2, op: 'missing', value: 99 },
    ],
    sort: { key: ID, direction: 'desc', junk: 1 },
    search: '  ana ',
    showChange: true,
    unknown: 'dropped',
  });
  assert.deepEqual(result, {
    value: {
      periodMode: 'fixed',
      periodNumber: 7,
      parameterIds: [ID],
      filters: [
        { parameterId: ID, op: 'lt', value: 5 },
        { parameterId: ID2, op: 'missing' },
      ],
      sort: { key: ID, direction: 'desc' },
      search: 'ana',
      showChange: true,
    },
  });
});

test('a minimal config gets defaults', () => {
  assert.deepEqual(parseViewConfig({ periodMode: 'current' }), { value: DEFAULTS });
  assert.deepEqual(parseViewConfig({}), { value: DEFAULTS });
});

test('period settings are checked', () => {
  assert.ok(parseViewConfig({ periodMode: 'later' }).error);
  assert.ok(parseViewConfig({ periodMode: 'fixed' }).error);
  assert.ok(parseViewConfig({ periodMode: 'fixed', periodNumber: 0 }).error);
  assert.ok(parseViewConfig({ periodMode: 'fixed', periodNumber: 1.5 }).error);
  assert.ok(parseViewConfig({ periodMode: 'fixed', periodNumber: 5001 }).error);
  assert.equal(
    parseViewConfig({ periodMode: 'current', periodNumber: 4 }).value.periodNumber,
    null
  );
});

test('filters are checked', () => {
  const filter = (over) => parseViewConfig({ filters: [{ parameterId: ID, op: 'lt', value: 5, ...over }] });
  assert.equal(filter({}).error, undefined);
  assert.ok(filter({ op: 'bogus' }).error);
  assert.ok(filter({ value: undefined }).error);
  assert.ok(filter({ value: '5' }).error);
  assert.ok(filter({ value: 1e12 }).error);
  assert.ok(filter({ parameterId: 'nope' }).error);
  assert.ok(parseViewConfig({ filters: 'x' }).error);
  assert.ok(parseViewConfig({ filters: [null] }).error);
  const eleven = Array.from({ length: 11 }, () => ({ parameterId: ID, op: 'present' }));
  assert.ok(parseViewConfig({ filters: eleven }).error);
});

test('columns, sort, search and the change flag are checked', () => {
  assert.ok(parseViewConfig({ parameterIds: [ID, ID] }).error);
  assert.ok(parseViewConfig({ parameterIds: ['nope'] }).error);
  assert.ok(parseViewConfig({ parameterIds: 'x' }).error);
  assert.ok(parseViewConfig({ sort: { key: 'bogus', direction: 'asc' } }).error);
  assert.ok(parseViewConfig({ sort: { key: 'name', direction: 'up' } }).error);
  assert.ok(parseViewConfig({ sort: 'name' }).error);
  assert.equal(parseViewConfig({ sort: { key: 'code', direction: 'desc' } }).error, undefined);
  assert.ok(parseViewConfig({ search: 'x'.repeat(101) }).error);
  assert.ok(parseViewConfig({ search: 5 }).error);
  assert.ok(parseViewConfig({ showChange: 'yes' }).error);
  assert.ok(parseViewConfig(null).error);
  assert.ok(parseViewConfig([]).error);
});

test('view names are trimmed and length-checked', () => {
  assert.deepEqual(parseViewName('  Needs   attention '), { value: 'Needs attention' });
  assert.ok(parseViewName('   ').error);
  assert.ok(parseViewName('x'.repeat(61)).error);
  assert.ok(parseViewName(undefined).error);
});

test('saved views are personal and not written to the audit log', () => {
  assert.equal(classifyRequest('POST', '/api/saved-views', 201), null);
  assert.equal(classifyRequest('PUT', '/api/saved-views/abc', 200), null);
  assert.equal(classifyRequest('DELETE', '/api/saved-views/abc', 204), null);
});