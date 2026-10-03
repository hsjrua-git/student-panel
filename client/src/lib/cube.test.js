import { describe, it, expect } from 'vitest';
import { buildCube } from './cube.js';

const parameters = [
  { id: 'speed', name: 'Speed', unit: null, minValue: 0, maxValue: 10 },
  { id: 'balance', name: 'Balance', unit: null, minValue: null, maxValue: null },
];

const students = [
  { id: 's1', fullName: 'Ana', studentCode: 'AAAAAAAA' },
  { id: 's2', fullName: 'Ben', studentCode: 'BBBBBBBB' },
];

// Requested periods are 2 and 3; period 1 is present only as the "previous"
// slice the server keeps so deltas at period 2 can be computed client-side.
const periods = [
  { number: 2, startDate: 'd2s', endDate: 'd2e', parameterIds: ['speed'] },
  { number: 3, startDate: 'd3s', endDate: 'd3e', parameterIds: ['speed', 'balance'] },
];

const cells = [
  { studentId: 's1', parameterId: 'speed', periodNumber: 1, value: 4 },
  { studentId: 's1', parameterId: 'speed', periodNumber: 2, value: 6 },
  { studentId: 's1', parameterId: 'speed', periodNumber: 3, value: 8 },
  { studentId: 's1', parameterId: 'balance', periodNumber: 3, value: 5 },
  { studentId: 's2', parameterId: 'speed', periodNumber: 2, value: 3 },
  { studentId: 's2', parameterId: 'speed', periodNumber: 3, value: 3 },
];

const build = (filters = []) =>
  buildCube({ periods, parameters, students, cells, filters });

describe('buildCube', () => {
  it('looks up values and returns null for a missing cell', () => {
    const cube = build();
    expect(cube.valueAt('s1', 'speed', 2)).toBe(6);
    expect(cube.valueAt('s2', 'balance', 3)).toBe(null);
  });

  it('computes the delta against the previous period, null when either side is missing', () => {
    const cube = build();
    expect(cube.cellAt('s1', 'speed', 2)).toEqual({ value: 6, previous: 4, delta: 2 });
    expect(cube.cellAt('s1', 'speed', 3)).toEqual({ value: 8, previous: 6, delta: 2 });
    // s2 has no period-1 speed, so period 2 has no delta.
    expect(cube.cellAt('s2', 'speed', 2)).toEqual({ value: 3, previous: null, delta: null });
  });

  it('exposes lastPeriod and the requested period numbers', () => {
    const cube = build();
    expect(cube.periodNumbers).toEqual([2, 3]);
    expect(cube.lastPeriod).toBe(3);
  });

  it('narrows the roster with a numeric filter judged at the last requested period', () => {
    const cube = build([{ parameterId: 'speed', op: 'gte', value: 5 }]);
    // At period 3, only Ana (8) clears 5; Ben (3) is dropped.
    expect(cube.students.map((s) => s.id)).toEqual(['s1']);
  });

  it('supports present/missing filters against the last period', () => {
    expect(build([{ parameterId: 'balance', op: 'present' }]).students.map((s) => s.id)).toEqual([
      's1',
    ]);
    expect(build([{ parameterId: 'balance', op: 'missing' }]).students.map((s) => s.id)).toEqual([
      's2',
    ]);
  });
});
