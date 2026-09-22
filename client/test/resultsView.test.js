import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyView,
  changeOf,
  defaultConfig,
  describeFilter,
  normalizeConfig,
  sameConfig,
  toggleColumn,
  toggleSort,
} from '../src/lib/resultsView.js';

const speed = { id: 'speed', name: 'Speed', minValue: 0, maxValue: 10, inUse: true };
const balance = { id: 'balance', name: 'Balance', minValue: null, maxValue: null, inUse: true };
const parameters = [speed, balance];

const students = [
  { id: 'a', fullName: 'Ana Souza', studentCode: 'K7M2QX9A', values: { speed: 7, balance: 4 }, previous: { speed: 6 } },
  { id: 'b', fullName: 'Ben Ortiz', studentCode: 'P4T9WB2E', values: { speed: 3 }, previous: { speed: 5, balance: 5 } },
  { id: 'c', fullName: 'Cleo Vance', studentCode: 'M5N6R7S8', values: {}, previous: {} },
  { id: 'd', fullName: 'Dan Wu', studentCode: 'H2J3K4L5', values: { speed: 7 }, previous: {} },
];

const run = (over) =>
  applyView({ students, parameters, config: { ...defaultConfig(), ...over } });
const names = (result) => result.rows.map((row) => row.fullName);

test('filters combine and treat missing scores correctly', () => {
  assert.deepEqual(
    names(run({ filters: [{ parameterId: 'speed', op: 'lt', value: 5 }] })),
    ['Ben Ortiz']
  );
  assert.deepEqual(
    names(run({ filters: [{ parameterId: 'speed', op: 'gte', value: 7 }] })),
    ['Ana Souza', 'Dan Wu']
  );
  assert.deepEqual(
    names(run({ filters: [{ parameterId: 'speed', op: 'eq', value: 7 }] })),
    ['Ana Souza', 'Dan Wu']
  );
  assert.deepEqual(
    names(
      run({
        filters: [
          { parameterId: 'speed', op: 'gte', value: 7 },
          { parameterId: 'balance', op: 'present' },
        ],
      })
    ),
    ['Ana Souza']
  );
  assert.deepEqual(
    names(run({ filters: [{ parameterId: 'speed', op: 'missing' }] })),
    ['Cleo Vance']
  );
});

test('search matches names and codes, ignoring case and hyphens', () => {
  assert.deepEqual(names(run({ search: 'ben' })), ['Ben Ortiz']);
  assert.deepEqual(names(run({ search: 'k7m2-qx' })), ['Ana Souza']);
  assert.deepEqual(names(run({ search: 'ZZZ' })), []);
  assert.equal(run({ search: '   ' }).rows.length, 4);
});

test('sorting by name, code and parameter, with missing scores always last', () => {
  assert.deepEqual(names(run({})), ['Ana Souza', 'Ben Ortiz', 'Cleo Vance', 'Dan Wu']);
  assert.deepEqual(
    names(run({ sort: { key: 'name', direction: 'desc' } })),
    ['Dan Wu', 'Cleo Vance', 'Ben Ortiz', 'Ana Souza']
  );
  assert.deepEqual(
    names(run({ sort: { key: 'code', direction: 'asc' } })),
    ['Dan Wu', 'Ana Souza', 'Cleo Vance', 'Ben Ortiz']
  );
  assert.deepEqual(
    names(run({ sort: { key: 'speed', direction: 'asc' } })),
    ['Ben Ortiz', 'Ana Souza', 'Dan Wu', 'Cleo Vance']
  );
  assert.deepEqual(
    names(run({ sort: { key: 'speed', direction: 'desc' } })),
    ['Ana Souza', 'Dan Wu', 'Ben Ortiz', 'Cleo Vance']
  );
  assert.deepEqual(
    names(run({ sort: { key: 'ghost', direction: 'desc' } })),
    ['Ana Souza', 'Ben Ortiz', 'Cleo Vance', 'Dan Wu']
  );
});

test('filters on parameters that are not shown are ignored and counted', () => {
  const result = run({ filters: [{ parameterId: 'gone', op: 'lt', value: 5 }] });
  assert.equal(result.rows.length, 4);
  assert.equal(result.ignoredFilters, 1);
  assert.equal(run({}).ignoredFilters, 0);
});

test('class statistics cover the students that pass the filters', () => {
  const all = run({}).stats;
  assert.deepEqual(all.speed, { count: 3, average: 5.67, min: 3, max: 7 });
  assert.deepEqual(all.balance, { count: 1, average: 4, min: 4, max: 4 });

  const nobody = run({ filters: [{ parameterId: 'speed', op: 'missing' }] }).stats;
  assert.deepEqual(nobody.speed, { count: 0, average: null, min: null, max: null });
});

test('settings are normalised and compared without noise', () => {
  assert.deepEqual(normalizeConfig(undefined), defaultConfig());
  assert.deepEqual(
    normalizeConfig({
      periodMode: 'fixed',
      periodNumber: 3,
      filters: [
        { key: 'f1', parameterId: 'speed', op: 'lt', value: 5, extra: 1 },
        { parameterId: 'x', op: 'bogus' },
      ],
      sort: { key: 'code', direction: 'desc' },
      search: ' ana ',
      showChange: true,
      junk: 1,
    }),
    {
      periodMode: 'fixed',
      periodNumber: 3,
      parameterIds: [],
      filters: [{ parameterId: 'speed', op: 'lt', value: 5 }],
      sort: { key: 'code', direction: 'desc' },
      search: 'ana',
      showChange: true,
    }
  );
  assert.equal(normalizeConfig({ periodMode: 'fixed' }).periodMode, 'current');
  assert.equal(sameConfig(defaultConfig(), { ...defaultConfig(), junk: 1 }), true);
  assert.equal(sameConfig(defaultConfig(), { ...defaultConfig(), search: 'x' }), false);
});

test('helpers: change, sort toggle, column toggle, filter text', () => {
  assert.equal(changeOf(students[0], 'speed'), 1);
  assert.equal(changeOf(students[1], 'speed'), -2);
  assert.equal(changeOf(students[1], 'balance'), null);
  assert.equal(changeOf(students[3], 'speed'), null);

  assert.deepEqual(toggleSort({ key: 'name', direction: 'asc' }, 'name'), { key: 'name', direction: 'desc' });
  assert.deepEqual(toggleSort({ key: 'name', direction: 'desc' }, 'code'), { key: 'code', direction: 'asc' });

  assert.deepEqual(toggleColumn([], ['a', 'b', 'c'], 'b', false), ['a', 'c']);
  assert.deepEqual(toggleColumn(['a', 'c'], ['a', 'b', 'c'], 'b', true), []);
  assert.deepEqual(toggleColumn(['a'], ['a', 'b'], 'a', false), ['a']);
  assert.deepEqual(toggleColumn([], ['a'], 'a', false), []);

  const byId = new Map([['speed', speed]]);
  assert.equal(describeFilter({ parameterId: 'speed', op: 'lt', value: 5 }, byId), 'Speed < 5');
  assert.equal(describeFilter({ parameterId: 'speed', op: 'missing' }, byId), 'Speed not measured');
  assert.equal(describeFilter({ parameterId: 'zzz', op: 'present' }, byId), 'Unknown parameter measured');
});