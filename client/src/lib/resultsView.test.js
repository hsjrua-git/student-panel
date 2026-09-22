import { describe, it, expect } from 'vitest';
import {
  applyView,
  changeOf,
  defaultConfig,
  describeFilter,
  normalizeConfig,
  sameConfig,
  toggleColumn,
  toggleSort,
} from './resultsView.js';

const parameters = [
  { id: 'p1', name: 'Speed' },
  { id: 'p2', name: 'Strength' },
];
const parametersById = new Map(parameters.map((p) => [p.id, p]));

const students = [
  { id: 'a', fullName: 'Bea', studentCode: 'S2', values: { p1: 5 }, previous: { p1: 3 } },
  { id: 'b', fullName: 'Ada', studentCode: 'S1', values: { p1: 9, p2: 4 }, previous: {} },
  { id: 'c', fullName: 'Cid', studentCode: 'S3', values: {}, previous: {} },
];

describe('normalizeConfig', () => {
  it('falls back to defaults for junk input', () => {
    expect(normalizeConfig(null)).toEqual(defaultConfig());
    expect(normalizeConfig(42)).toEqual(defaultConfig());
  });

  it('keeps a valid fixed period but rejects a bad one', () => {
    expect(normalizeConfig({ periodMode: 'fixed', periodNumber: 3 })).toMatchObject({
      periodMode: 'fixed',
      periodNumber: 3,
    });
    expect(normalizeConfig({ periodMode: 'fixed', periodNumber: 0 })).toMatchObject({
      periodMode: 'current',
      periodNumber: null,
    });
  });

  it('drops filters that are malformed or missing a required value', () => {
    const config = normalizeConfig({
      filters: [
        { parameterId: 'p1', op: 'gte', value: 5 }, // ok
        { parameterId: 'p1', op: 'gte' }, // needs a value
        { parameterId: 'p2', op: 'missing' }, // no value needed
        { op: 'gte', value: 1 }, // no parameter
        'nonsense',
      ],
    });
    expect(config.filters).toEqual([
      { parameterId: 'p1', op: 'gte', value: 5 },
      { parameterId: 'p2', op: 'missing' },
    ]);
  });
});

describe('sameConfig', () => {
  it('compares by normalized value, not reference', () => {
    expect(sameConfig({ search: ' hi ' }, { search: 'hi' })).toBe(true);
    expect(sameConfig({ showChange: true }, { showChange: false })).toBe(false);
  });
});

describe('toggleSort', () => {
  it('flips direction on the same key and resets to asc on a new key', () => {
    expect(toggleSort({ key: 'name', direction: 'asc' }, 'name')).toEqual({
      key: 'name',
      direction: 'desc',
    });
    expect(toggleSort({ key: 'name', direction: 'desc' }, 'code')).toEqual({
      key: 'code',
      direction: 'asc',
    });
  });
});

describe('toggleColumn', () => {
  const allIds = ['p1', 'p2'];

  it('hiding one of "all shown" narrows to the rest', () => {
    expect(toggleColumn([], allIds, 'p1', false)).toEqual(['p2']);
  });

  it('showing the final missing column collapses back to "all" ([])', () => {
    expect(toggleColumn(['p1'], allIds, 'p2', true)).toEqual([]);
  });

  it('refuses to hide the last visible column', () => {
    expect(toggleColumn(['p2'], allIds, 'p2', false)).toEqual(['p2']);
  });
});

describe('changeOf', () => {
  it('rounds the delta when both periods have a value', () => {
    expect(changeOf({ values: { p1: 5 }, previous: { p1: 3 } }, 'p1')).toBe(2);
  });

  it('is null when either side is missing', () => {
    expect(changeOf({ values: {}, previous: { p1: 3 } }, 'p1')).toBe(null);
  });
});

describe('describeFilter', () => {
  it('renders a value operator with its symbol', () => {
    expect(describeFilter({ parameterId: 'p1', op: 'gte', value: 5 }, parametersById)).toBe(
      'Speed ≥ 5',
    );
  });

  it('renders the valueless operators in words', () => {
    expect(describeFilter({ parameterId: 'p2', op: 'missing' }, parametersById)).toBe(
      'Strength not measured',
    );
  });
});

describe('applyView', () => {
  it('filters by a threshold and ignores filters for unknown parameters', () => {
    const { rows, ignoredFilters } = applyView({
      students,
      parameters,
      config: {
        ...defaultConfig(),
        filters: [
          { parameterId: 'p1', op: 'gte', value: 6 },
          { parameterId: 'ghost', op: 'gte', value: 1 },
        ],
      },
    });
    expect(rows.map((r) => r.id)).toEqual(['b']); // only p1 >= 6
    expect(ignoredFilters).toBe(1);
  });

  it('supports missing/present operators', () => {
    const present = applyView({
      students,
      parameters,
      config: { ...defaultConfig(), filters: [{ parameterId: 'p1', op: 'present' }] },
    });
    expect(present.rows.map((r) => r.id).sort()).toEqual(['a', 'b']);

    const missing = applyView({
      students,
      parameters,
      config: { ...defaultConfig(), filters: [{ parameterId: 'p1', op: 'missing' }] },
    });
    expect(missing.rows.map((r) => r.id)).toEqual(['c']);
  });

  it('searches by name and by normalized code', () => {
    const byName = applyView({
      students,
      parameters,
      config: { ...defaultConfig(), search: 'ada' },
    });
    expect(byName.rows.map((r) => r.id)).toEqual(['b']);

    const byCode = applyView({
      students,
      parameters,
      config: { ...defaultConfig(), search: 's3' },
    });
    expect(byCode.rows.map((r) => r.id)).toEqual(['c']);
  });

  it('sorts by a parameter value, pushing the unmeasured to the end', () => {
    const { rows } = applyView({
      students,
      parameters,
      config: { ...defaultConfig(), sort: { key: 'p1', direction: 'desc' } },
    });
    // b(9), a(5), then c (no value) last regardless of direction.
    expect(rows.map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('computes per-parameter stats over the visible rows', () => {
    const { stats } = applyView({
      students,
      parameters,
      config: defaultConfig(),
    });
    expect(stats.p1).toEqual({ count: 2, average: 7, min: 5, max: 9 });
    expect(stats.p2).toEqual({ count: 1, average: 4, min: 4, max: 4 });
  });
});
