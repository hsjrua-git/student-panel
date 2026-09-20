import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parameterView, percentOfRange, periodView } from '../src/lib/views.js';

const speed = { id: 'speed', name: 'Speed', minValue: 0, maxValue: 10 };
const balance = { id: 'balance', name: 'Balance', minValue: null, maxValue: null };
const old = { id: 'old', name: 'Old', minValue: null, maxValue: null };
const parameters = [speed, balance, old];

const periods = [
  { number: 1, startDate: '2026-09-19', endDate: '2026-09-25', parameterIds: ['speed'] },
  { number: 2, startDate: '2026-09-26', endDate: '2026-10-02', parameterIds: ['speed'] },
  {
    number: 3,
    startDate: '2026-10-03',
    endDate: '2026-10-09',
    parameterIds: ['speed', 'balance'],
  },
];

const evaluations = [
  { periodNumber: 1, parameterId: 'speed', value: 6 },
  { periodNumber: 2, parameterId: 'speed', value: 8 },
  { periodNumber: 3, parameterId: 'balance', value: 4 },
];

const summary = (rows) =>
  rows.map((r) => [r.parameter.id, r.value, r.previous, r.change, r.percent]);

test('percent of range, clamped and null when there is no range', () => {
  assert.equal(percentOfRange(5, 0, 10), 50);
  assert.equal(percentOfRange(11, 0, 10), 100);
  assert.equal(percentOfRange(-1, 0, 10), 0);
  assert.equal(percentOfRange(5, null, 10), null);
  assert.equal(percentOfRange(null, 0, 10), null);
  assert.equal(percentOfRange(5, 3, 3), null);
});

test('period view compares with the previous period', () => {
  assert.deepEqual(
    summary(periodView({ periodNumber: 1, evaluations, periods, parameters })),
    [['speed', 6, null, null, 60]]
  );
  assert.deepEqual(
    summary(periodView({ periodNumber: 2, evaluations, periods, parameters })),
    [['speed', 8, 6, 2, 80]]
  );
});

test('a parameter in use but not measured shows an empty value', () => {
  assert.deepEqual(
    summary(periodView({ periodNumber: 3, evaluations, periods, parameters })),
    [
      ['speed', null, 8, null, null],
      ['balance', 4, null, null, null],
    ]
  );
});

test('a score for a parameter no longer in use still appears, marked as not in use', () => {
  const withOld = [...evaluations, { periodNumber: 2, parameterId: 'old', value: 5 }];
  const rows = periodView({ periodNumber: 2, evaluations: withOld, periods, parameters });
  assert.deepEqual(
    rows.map((r) => [r.parameter.id, r.inUse, r.value]),
    [
      ['speed', true, 8],
      ['old', false, 5],
    ]
  );
});

test('changes are rounded to avoid floating point noise', () => {
  const values = [
    { periodNumber: 1, parameterId: 'balance', value: 0.1 },
    { periodNumber: 2, parameterId: 'balance', value: 0.3 },
  ];
  const usesBalance = periods.map((p) => ({ ...p, parameterIds: ['balance'] }));
  const rows = periodView({
    periodNumber: 2,
    evaluations: values,
    periods: usesBalance,
    parameters,
  });
  assert.equal(rows[0].change, 0.2);
});

test('parameter view has gaps for missing periods and summary numbers', () => {
  const scores = [
    { periodNumber: 1, parameterId: 'speed', value: 6 },
    { periodNumber: 3, parameterId: 'speed', value: 8 },
  ];
  const { points, stats } = parameterView({
    parameterId: 'speed',
    evaluations: scores,
    periods,
  });
  assert.deepEqual(
    points.map((p) => [p.periodNumber, p.value]),
    [
      [1, 6],
      [2, null],
      [3, 8],
    ]
  );
  assert.deepEqual(stats, {
    count: 2,
    first: { periodNumber: 1, value: 6 },
    latest: { periodNumber: 3, value: 8 },
    average: 7,
    change: 2,
  });
});

test('parameter view starts at the first score; one score has no change', () => {
  const { points, stats } = parameterView({
    parameterId: 'balance',
    evaluations,
    periods,
  });
  assert.deepEqual(
    points.map((p) => [p.periodNumber, p.value]),
    [[3, 4]]
  );
  assert.equal(stats.count, 1);
  assert.equal(stats.average, 4);
  assert.equal(stats.change, null);
});

test('parameter view keeps a scored period even if the parameter is no longer used there', () => {
  const nobodyUses = periods.map((p) => ({ ...p, parameterIds: [] }));
  const { points } = parameterView({
    parameterId: 'speed',
    evaluations: [{ periodNumber: 2, parameterId: 'speed', value: 5 }],
    periods: nobodyUses,
  });
  assert.deepEqual(
    points.map((p) => [p.periodNumber, p.value]),
    [[2, 5]]
  );
});

test('parameter view with no scores is empty', () => {
  assert.deepEqual(
    parameterView({ parameterId: 'old', evaluations, periods }),
    { points: [], stats: null }
  );
});