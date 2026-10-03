import { describe, it, expect } from 'vitest';
import {
  cohortField,
  distribution,
  parameterStats,
  studentBreakdown,
  summarize,
  trendSeries,
  unmeasuredStudents,
} from './dashboard.js';

const results = {
  parameters: [
    { id: 'p1', name: 'Speed', inUse: true, minValue: 0, maxValue: 10 },
    { id: 'p2', name: 'Strength', inUse: true, minValue: null, maxValue: null },
    { id: 'p3', name: 'Retired', inUse: false, minValue: null, maxValue: null },
  ],
  students: [
    { id: 'a', fullName: 'Ada', studentCode: 'S1', values: { p1: 8, p2: 4 }, previous: { p1: 6 } },
    { id: 'b', fullName: 'Bea', studentCode: 'S2', values: { p1: 6 }, previous: { p1: 6 } },
    { id: 'c', fullName: 'Cid', studentCode: 'S3', values: {}, previous: {} },
  ],
};

describe('summarize', () => {
  it('counts completion against the parameters in use only', () => {
    const s = summarize(results);
    expect(s.students).toBe(3);
    expect(s.parametersInUse).toBe(2); // p3 excluded
    expect(s.expected).toBe(6); // 3 students × 2 params
    expect(s.measured).toBe(3); // a:2 + b:1 + c:0
    expect(s.completion).toBe(50); // 3/6
    expect(s).toMatchObject({ studentsComplete: 1, studentsPartial: 1, studentsNone: 1 });
  });

  it('reports null completion when nothing is expected', () => {
    const empty = { parameters: [], students: [{ id: 'a', values: {}, previous: {} }] };
    expect(summarize(empty).completion).toBe(null);
  });
});

describe('cohortField', () => {
  it('classifies each student by measurement completeness, in roster order', () => {
    const field = cohortField(results);
    expect(field.map((s) => s.id)).toEqual(['a', 'b', 'c']); // roster order kept
    expect(field).toEqual([
      { id: 'a', fullName: 'Ada', studentCode: 'S1', measured: 2, inUse: 2, state: 'full' },
      { id: 'b', fullName: 'Bea', studentCode: 'S2', measured: 1, inUse: 2, state: 'partial' },
      { id: 'c', fullName: 'Cid', studentCode: 'S3', measured: 0, inUse: 2, state: 'none' },
    ]);
    // The three buckets mirror summarize's complete/partial/none totals.
    const s = summarize(results);
    const byState = (state) => field.filter((f) => f.state === state).length;
    expect(byState('full')).toBe(s.studentsComplete);
    expect(byState('partial')).toBe(s.studentsPartial);
    expect(byState('none')).toBe(s.studentsNone);
  });

  it('marks everyone "none" when no parameters are in use', () => {
    const noParams = {
      parameters: [{ id: 'p3', name: 'Retired', inUse: false }],
      students: [{ id: 'a', fullName: 'Ada', studentCode: 'S1', values: {}, previous: {} }],
    };
    expect(cohortField(noParams)).toEqual([
      { id: 'a', fullName: 'Ada', studentCode: 'S1', measured: 0, inUse: 0, state: 'none' },
    ]);
  });
});

describe('parameterStats', () => {
  it('computes count/avg/min/max and the average paired change', () => {
    const stats = parameterStats(results);
    const p1 = stats.find((s) => s.parameter.id === 'p1');
    expect(p1).toMatchObject({ count: 2, average: 7, min: 6, max: 8 });
    // Both Ada (8-6=2) and Bea (6-6=0) have a current and previous value, so
    // the average change is (2 + 0) / 2 = 1 across 2 paired values.
    expect(p1.paired).toBe(2);
    expect(p1.averageChange).toBe(1);

    const p3 = stats.find((s) => s.parameter.id === 'p3');
    expect(p3).toMatchObject({ count: 0, average: null, averageChange: null });
  });
});

describe('distribution', () => {
  it('bins across the parameter range when one is defined', () => {
    const bins = distribution([0, 2, 5, 10], { minValue: 0, maxValue: 10 }, 5);
    expect(bins).toHaveLength(5);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(4);
    // 10 lands in the last bin, not a phantom sixth one.
    expect(bins[4].count).toBe(1);
  });

  it('returns a single bin when every value is identical', () => {
    const bins = distribution([5, 5, 5], { minValue: null, maxValue: null });
    expect(bins).toEqual([{ from: 5, to: 5, label: '5', count: 3 }]);
  });

  it('is empty for no values and no range', () => {
    expect(distribution([], { minValue: null, maxValue: null })).toEqual([]);
  });
});

describe('trendSeries', () => {
  const periods = [
    { number: 1, parameterIds: ['p1'] },
    { number: 2, parameterIds: ['p1'] },
    { number: 3, parameterIds: [] },
  ];

  it('starts at the first period with data and fills gaps with nulls', () => {
    const series = trendSeries({
      trends: [
        { parameterId: 'p1', periodNumber: 2, average: 7, count: 3 },
      ],
      periods,
      parameterId: 'p1',
    });
    // First data is period 2, so period 1 (before it) is dropped. Period 3
    // neither uses p1 nor has data, so it is left out too.
    expect(series).toEqual([{ periodNumber: 2, average: 7, count: 3 }]);
  });

  it('is empty when the parameter has no trend rows', () => {
    expect(trendSeries({ trends: [], periods, parameterId: 'p1' })).toEqual([]);
  });
});

describe('studentBreakdown', () => {
  it('lists in-use parameters with the value and paired change for one student', () => {
    const b = studentBreakdown(results, 'a');
    expect(b).toMatchObject({
      id: 'a',
      fullName: 'Ada',
      studentCode: 'S1',
      measured: 2,
      inUse: 2,
    });
    expect(b.rows.map((r) => r.parameter.id)).toEqual(['p1', 'p2']); // p3 excluded
    expect(b.rows[0]).toMatchObject({ value: 8, change: 2 }); // 8 − previous 6
    expect(b.rows[1]).toMatchObject({ value: 4, change: null }); // no previous
  });

  it('marks missing scores null and does not count them as measured', () => {
    const b = studentBreakdown(results, 'c');
    expect(b.measured).toBe(0);
    expect(b.rows.every((r) => r.value === null && r.change === null)).toBe(true);
  });

  it('returns an empty-but-shaped record for an unknown student', () => {
    const b = studentBreakdown(results, 'zzz');
    expect(b).toMatchObject({ id: 'zzz', fullName: '', measured: 0, inUse: 2 });
    expect(b.rows).toHaveLength(2);
  });
});

describe('unmeasuredStudents', () => {
  it('lists students missing in-use parameters, most-missing first', () => {
    const list = unmeasuredStudents(results);
    expect(list.map((s) => s.id)).toEqual(['c', 'b']); // c missing 2, b missing 1
    expect(list[0].missing).toEqual(['Speed', 'Strength']);
    expect(list[1].missing).toEqual(['Strength']);
  });
});
