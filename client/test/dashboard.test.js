import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distribution,
  parameterStats,
  summarize,
  trendSeries,
  unmeasuredStudents,
} from '../src/lib/dashboard.js';

const parameters = [
  { id: 'speed', name: 'Speed', minValue: 0, maxValue: 10, inUse: true },
  { id: 'balance', name: 'Balance', minValue: null, maxValue: null, inUse: true },
  { id: 'old', name: 'Old', minValue: null, maxValue: null, inUse: false },
];

const students = [
  { id: 'a', fullName: 'Ana', studentCode: 'AAAAAAAA', values: { speed: 8, balance: 4 }, previous: { speed: 6 } },
  { id: 'b', fullName: 'Ben', studentCode: 'BBBBBBBB', values: { speed: 3 }, previous: { speed: 5, balance: 5 } },
  { id: 'c', fullName: 'Cleo', studentCode: 'CCCCCCCC', values: {}, previous: {} },
  { id: 'd', fullName: 'Dan', studentCode: 'DDDDDDDD', values: { speed: 7, old: 2 }, previous: {} },
];

const results = { parameters, students };

test('the summary counts scores and how complete the period is', () => {
  assert.deepEqual(summarize(results), {
    students: 4,
    parametersInUse: 2,
    expected: 8,
    measured: 4,
    completion: 50,
    studentsComplete: 1,
    studentsPartial: 2,
    studentsNone: 1,
  });
  assert.deepEqual(summarize({ parameters: [], students }), {
    students: 4,
    parametersInUse: 0,
    expected: 0,
    measured: 0,
    completion: null,
    studentsComplete: 0,
    studentsPartial: 0,
    studentsNone: 4,
  });
});

test('parameter statistics compare only students measured both times', () => {
  const stats = Object.fromEntries(
    parameterStats(results).map((stat) => [stat.parameter.id, stat])
  );
  assert.deepEqual(
    [stats.speed.count, stats.speed.average, stats.speed.min, stats.speed.max],
    [3, 6, 3, 8]
  );
  assert.deepEqual([stats.speed.paired, stats.speed.averageChange], [2, 0]);
  assert.deepEqual(
    [stats.balance.count, stats.balance.average, stats.balance.paired, stats.balance.averageChange],
    [1, 4, 0, null]
  );
  assert.deepEqual([stats.old.count, stats.old.average], [1, 2]);

  const empty = parameterStats({ parameters: [parameters[0]], students: [] })[0];
  assert.deepEqual([empty.count, empty.average, empty.min, empty.max], [0, null, null, null]);
});

test('the distribution splits the parameter range into bins', () => {
  const bins = distribution([8, 3, 7, 0, 10], parameters[0]);
  assert.deepEqual(
    bins.map((bin) => bin.label),
    ['0–2', '2–4', '4–6', '6–8', '8–10']
  );
  assert.deepEqual(
    bins.map((bin) => bin.count),
    [1, 1, 0, 1, 2]
  );
  assert.deepEqual(
    distribution([], parameters[0]).map((bin) => bin.count),
    [0, 0, 0, 0, 0]
  );
});

test('the distribution without a range uses the data itself', () => {
  assert.deepEqual(distribution([], parameters[1]), []);
  assert.deepEqual(distribution([4, 4], parameters[1]), [
    { from: 4, to: 4, label: '4', count: 2 },
  ]);
  assert.deepEqual(
    distribution([2, 4, 6], parameters[1]).map((bin) => bin.count),
    [1, 0, 1, 0, 1]
  );
});

const periods = [
  { number: 1, parameterIds: ['speed'] },
  { number: 2, parameterIds: ['speed'] },
  { number: 3, parameterIds: ['speed', 'balance'] },
  { number: 4, parameterIds: ['speed', 'balance'] },
];
const trends = [
  { parameterId: 'speed', periodNumber: 1, average: 6, count: 10 },
  { parameterId: 'speed', periodNumber: 3, average: 7.5, count: 9 },
  { parameterId: 'balance', periodNumber: 4, average: 5, count: 8 },
];

test('trend series has gaps for periods without data and starts at the first data', () => {
  assert.deepEqual(
    trendSeries({ trends, periods, parameterId: 'speed' }).map((p) => [p.periodNumber, p.average]),
    [
      [1, 6],
      [2, null],
      [3, 7.5],
      [4, null],
    ]
  );
  assert.deepEqual(
    trendSeries({ trends, periods, parameterId: 'balance' }).map((p) => [p.periodNumber, p.average]),
    [[4, 5]]
  );
  assert.deepEqual(trendSeries({ trends, periods, parameterId: 'old' }), []);
});

test('students who are missing scores are listed, most missing first', () => {
  assert.deepEqual(
    unmeasuredStudents(results).map((item) => [item.fullName, item.missing]),
    [
      ['Cleo', ['Speed', 'Balance']],
      ['Ben', ['Balance']],
      ['Dan', ['Balance']],
    ]
  );
  assert.deepEqual(unmeasuredStudents({ parameters: [], students }), []);
});