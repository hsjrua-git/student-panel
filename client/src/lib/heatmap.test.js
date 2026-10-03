import { describe, it, expect } from 'vitest';
import { buildCube } from './cube.js';
import { buildHeatmap } from './heatmap.js';

const parameters = [
  { id: 'speed', name: 'Speed', unit: null, minValue: 0, maxValue: 10 },
  { id: 'balance', name: 'Balance', unit: null, minValue: null, maxValue: null },
];
const students = [
  { id: 's1', fullName: 'Ana', studentCode: 'AAAAAAAA' },
  { id: 's2', fullName: 'Ben', studentCode: 'BBBBBBBB' },
];
const periods = [
  { number: 2, startDate: 'd2s', endDate: 'd2e', parameterIds: ['speed'] },
  { number: 3, startDate: 'd3s', endDate: 'd3e', parameterIds: ['speed', 'balance'] },
];
const cells = [
  { studentId: 's1', parameterId: 'speed', periodNumber: 2, value: 6 },
  { studentId: 's1', parameterId: 'speed', periodNumber: 3, value: 8 },
  { studentId: 's1', parameterId: 'balance', periodNumber: 3, value: 5 },
  { studentId: 's2', parameterId: 'speed', periodNumber: 2, value: 3 },
  { studentId: 's2', parameterId: 'speed', periodNumber: 3, value: 3 },
];
const cube = buildCube({ periods, parameters, students, cells });

describe('buildHeatmap axis "period"', () => {
  it('puts periods across the top for one fixed parameter and shades by range', () => {
    const grid = buildHeatmap(cube, { axis: 'period', parameterId: 'speed' });
    expect(grid.parameterId).toBe('speed');
    expect(grid.columns.map((c) => c.key)).toEqual([2, 3]);
    expect(grid.rows.map((r) => r.id)).toEqual(['s1', 's2']);
    expect(grid.cells[0]).toEqual([
      { value: 6, percent: 60 },
      { value: 8, percent: 80 },
    ]);
    expect(grid.cells[1]).toEqual([
      { value: 3, percent: 30 },
      { value: 3, percent: 30 },
    ]);
  });

  it('falls back to the first parameter when none is named', () => {
    const grid = buildHeatmap(cube, { axis: 'period' });
    expect(grid.parameterId).toBe('speed');
  });
});

describe('buildHeatmap axis "parameter"', () => {
  it('puts parameters across the top for one fixed period; unbounded ranges have no percent', () => {
    const grid = buildHeatmap(cube, { axis: 'parameter', periodNumber: 3 });
    expect(grid.periodNumber).toBe(3);
    expect(grid.columns.map((c) => c.key)).toEqual(['speed', 'balance']);
    expect(grid.cells[0]).toEqual([
      { value: 8, percent: 80 },
      { value: 5, percent: null }, // balance has no min/max
    ]);
    expect(grid.cells[1]).toEqual([
      { value: 3, percent: 30 },
      { value: null, percent: null },
    ]);
  });

  it('defaults to the last requested period', () => {
    const grid = buildHeatmap(cube, { axis: 'parameter' });
    expect(grid.periodNumber).toBe(3);
  });
});
