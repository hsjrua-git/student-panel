import { describe, it, expect } from 'vitest';
import {
  defaultExportConfig,
  normalizeExportConfig,
  mergePrefill,
  exportConfigErrors,
  includesTabular,
} from './exportConfig.js';

describe('normalizeExportConfig', () => {
  it('defaults to a runnable data export', () => {
    const config = normalizeExportConfig(null);
    expect(config).toEqual(defaultExportConfig());
    expect(config.include.data).toBe(true);
    expect(exportConfigErrors(config)).toEqual([]);
  });

  it('falls back to "all" when a selection is empty or a group is missing', () => {
    const config = normalizeExportConfig({
      students: { mode: 'selection', ids: [] },
      parameters: { mode: 'selection', ids: [] },
      periods: { mode: 'selection', numbers: [] },
    });
    expect(config.students.mode).toBe('all');
    expect(config.parameters.mode).toBe('all');
    expect(config.periods.mode).toBe('all');

    expect(normalizeExportConfig({ students: { mode: 'group', groupId: '' } }).students.mode).toBe(
      'all'
    );
  });

  it('orders a reversed range and drops an incomplete one', () => {
    expect(normalizeExportConfig({ periods: { mode: 'range', from: 5, to: 2 } }).periods).toEqual({
      mode: 'range',
      from: 2,
      to: 5,
      numbers: [],
    });
    expect(normalizeExportConfig({ periods: { mode: 'range', from: 3, to: null } }).periods.mode).toBe(
      'all'
    );
  });

  it('cleans charts, dropping unknown kinds and defaulting options', () => {
    const config = normalizeExportConfig({
      charts: [
        { kind: 'nope' },
        { kind: 'comparison', parameterIds: ['a', 'a', 2], comparisonShape: 'pie' },
        { kind: 'heatmap', imageFormat: 'gif' },
      ],
    });
    expect(config.charts).toEqual([
      {
        kind: 'comparison',
        parameterIds: ['a'],
        periodNumber: null,
        comparisonShape: 'bar',
        heatmapAxis: 'period',
        imageFormat: 'png',
      },
      {
        kind: 'heatmap',
        parameterIds: [],
        periodNumber: null,
        comparisonShape: 'bar',
        heatmapAxis: 'period',
        imageFormat: 'png',
      },
    ]);
  });

  it('drops malformed filters but keeps valid ones', () => {
    const config = normalizeExportConfig({
      filters: [
        { parameterId: 'speed', op: 'gte', value: 5 },
        { parameterId: 'speed', op: 'gte' }, // needs a value
        { parameterId: 'x', op: 'present' },
        { op: 'lt', value: 1 }, // no parameterId
      ],
    });
    expect(config.filters).toEqual([
      { parameterId: 'speed', op: 'gte', value: 5 },
      { parameterId: 'x', op: 'present' },
    ]);
  });
});

describe('mergePrefill', () => {
  it('overlays a partial onto the defaults, merging nested scope', () => {
    const config = mergePrefill({
      students: { mode: 'group', groupId: 'g1' },
      parameters: { mode: 'selection', ids: ['p1', 'p2'] },
      include: { delta: true },
    });
    expect(config.students).toEqual({ mode: 'group', groupId: 'g1', ids: [] });
    expect(config.parameters).toEqual({ mode: 'selection', ids: ['p1', 'p2'] });
    expect(config.include.data).toBe(true); // untouched default preserved
    expect(config.include.delta).toBe(true);
  });
});

describe('exportConfigErrors', () => {
  it('requires at least one artifact', () => {
    const empty = normalizeExportConfig({
      include: { data: false, delta: false, trackingLog: false, auditTrail: false },
      charts: [],
    });
    expect(includesTabular(empty)).toBe(false);
    expect(exportConfigErrors(empty)).toHaveLength(1);
  });

  it('flags a trend chart with no parameters', () => {
    const config = normalizeExportConfig({
      include: { data: false },
      charts: [{ kind: 'trend', parameterIds: [] }],
    });
    expect(exportConfigErrors(config).length).toBeGreaterThan(0);
  });
});
