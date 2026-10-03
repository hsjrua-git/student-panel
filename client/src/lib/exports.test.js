import { describe, it, expect } from 'vitest';
import { buildCube } from './cube.js';
import {
  cubeLongRows,
  cubeWideRows,
  deltaRows,
  trackingLogRows,
  auditTrailRows,
  cubeJson,
} from './exports.js';

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
  { studentId: 's1', parameterId: 'speed', periodNumber: 1, value: 4 },
  { studentId: 's1', parameterId: 'speed', periodNumber: 2, value: 6 },
  { studentId: 's1', parameterId: 'speed', periodNumber: 3, value: 8 },
  { studentId: 's1', parameterId: 'balance', periodNumber: 3, value: 5 },
  { studentId: 's2', parameterId: 'speed', periodNumber: 2, value: 3 },
  { studentId: 's2', parameterId: 'speed', periodNumber: 3, value: 3 },
];
const cube = buildCube({ periods, parameters, students, cells });

describe('cubeLongRows', () => {
  it('emits one row per observed value in period → student → parameter order', () => {
    const rows = cubeLongRows(cube);
    expect(rows[0]).toEqual([
      'Period',
      'Start date',
      'End date',
      'Student code',
      'Full name',
      'Parameter',
      'Value',
    ]);
    expect(rows.slice(1)).toEqual([
      [2, 'd2s', 'd2e', 'AAAAAAAA', 'Ana', 'Speed', 6],
      [2, 'd2s', 'd2e', 'BBBBBBBB', 'Ben', 'Speed', 3],
      [3, 'd3s', 'd3e', 'AAAAAAAA', 'Ana', 'Speed', 8],
      [3, 'd3s', 'd3e', 'AAAAAAAA', 'Ana', 'Balance', 5],
      [3, 'd3s', 'd3e', 'BBBBBBBB', 'Ben', 'Speed', 3],
    ]);
  });

  it('adds a change column when includeDelta is set', () => {
    const rows = cubeLongRows(cube, { includeDelta: true });
    expect(rows[0].at(-1)).toBe('Change vs previous period');
    // Ana's speed at period 2 rose from 4 → 6.
    expect(rows[1].at(-1)).toBe(2);
    // Ben's speed at period 2 has no prior period, so no delta.
    expect(rows[2].at(-1)).toBe(null);
  });
});

describe('cubeWideRows', () => {
  it('lays out a parameter matrix, one row per period × student with data', () => {
    const rows = cubeWideRows(cube);
    expect(rows[0]).toEqual([
      'Period',
      'Start date',
      'End date',
      'Student code',
      'Full name',
      'Speed',
      'Balance',
    ]);
    expect(rows.slice(1)).toEqual([
      [2, 'd2s', 'd2e', 'AAAAAAAA', 'Ana', 6, null],
      [2, 'd2s', 'd2e', 'BBBBBBBB', 'Ben', 3, null],
      [3, 'd3s', 'd3e', 'AAAAAAAA', 'Ana', 8, 5],
      [3, 'd3s', 'd3e', 'BBBBBBBB', 'Ben', 3, null],
    ]);
  });
});

describe('deltaRows', () => {
  it('drops rows with no delta and keeps a zero delta', () => {
    const rows = deltaRows(cube).slice(1);
    expect(rows).toEqual([
      [2, 'd2s', 'd2e', 'AAAAAAAA', 'Ana', 2, null],
      [3, 'd3s', 'd3e', 'AAAAAAAA', 'Ana', 2, null],
      [3, 'd3s', 'd3e', 'BBBBBBBB', 'Ben', 0, null],
    ]);
  });
});

describe('trackingLogRows', () => {
  it('labels the scope and action and carries the parameter name', () => {
    const rows = trackingLogRows([
      {
        parameterId: 'speed',
        parameterName: 'Speed',
        periodNumber: 2,
        scope: 'from_here_on',
        action: 'add',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      {
        parameterId: 'old',
        parameterName: 'Old',
        periodNumber: 2,
        scope: 'this_period_only',
        action: 'remove',
        createdAt: '2025-02-01T00:00:00.000Z',
      },
    ]);
    expect(rows[0]).toEqual(['Parameter', 'Period', 'Scope', 'Action', 'Recorded (UTC)']);
    expect(rows[1]).toEqual(['Speed', 2, 'From this period on', 'Added', '2025-01-01T00:00:00.000Z']);
    expect(rows[2]).toEqual(['Old', 2, 'This period only', 'Removed', '2025-02-01T00:00:00.000Z']);
  });
});

describe('auditTrailRows', () => {
  it('maps a category label and reuses describeAudit for the description', () => {
    const rows = auditTrailRows([
      {
        occurredAt: '2025-03-01T10:00:00.000Z',
        actor: 'admin',
        action: 'scores.save',
        details: { count: 3, periodNumber: 2 },
      },
    ]);
    expect(rows[0]).toEqual(['When (UTC)', 'User', 'Category', 'Action', 'Description']);
    expect(rows[1]).toEqual([
      '2025-03-01T10:00:00.000Z',
      'admin',
      'Scores',
      'scores.save',
      'Saved 3 scores in Period 2',
    ]);
  });
});

describe('cubeJson', () => {
  it('nests values per student per period and drops empty periods', () => {
    const json = cubeJson(cube, { scope: { note: 'x' } });
    expect(json.scope).toEqual({ note: 'x' });
    expect(json.parameters.map((p) => p.id)).toEqual(['speed', 'balance']);
    const ana = json.students.find((s) => s.id === 's1');
    expect(ana.periods).toEqual([
      { period: 2, values: { speed: { value: 6, previous: 4, delta: 2 } } },
      {
        period: 3,
        values: {
          speed: { value: 8, previous: 6, delta: 2 },
          balance: { value: 5, previous: null, delta: null },
        },
      },
    ]);
  });
});
