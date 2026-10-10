// The Export Center's whole configuration lives in one plain object, shaped and
// validated here so the page (a single useReducer) and the tests share exactly
// one source of truth — mirroring how `resultsView.js` owns the Results config.
//
// Everything is a multi-select: an export can include the scores cube (data),
// period-over-period deltas, the parameter tracking log, the edit audit trail,
// and any number of charts — all at once. Bundling (single file vs ZIP) is
// decided later from how many artifacts a run actually produces.
import { OPERATORS } from './resultsView.js';

export const STUDENT_MODES = ['all', 'group', 'selection'];
export const PARAMETER_MODES = ['all', 'selection'];
export const PERIOD_MODES = ['all', 'range', 'selection'];
export const LAYOUTS = ['long', 'wide'];
export const TABULAR_FORMATS = ['csv', 'json', 'xlsx'];
export const CHART_KINDS = ['trend', 'distribution', 'comparison', 'heatmap'];
export const COMPARISON_SHAPES = ['bar', 'radar'];
export const HEATMAP_AXES = ['period', 'parameter'];
export const IMAGE_FORMATS = ['png', 'svg'];
export const MAX_CHARTS = 12;

const OPERATOR_VALUES = new Set(OPERATORS.map((operator) => operator.value));
const OPERATORS_WITH_VALUE = new Set(
  OPERATORS.filter((operator) => operator.needsValue).map((operator) => operator.value)
);

export function defaultExportConfig() {
  return {
    students: { mode: 'all', groupId: null, ids: [] },
    parameters: { mode: 'all', ids: [] },
    periods: { mode: 'all', from: null, to: null, numbers: [] },
    filters: [],
    include: { data: true, delta: false, trackingLog: false, auditTrail: false },
    layout: 'wide',
    tabularFormat: 'csv',
    charts: [],
  };
}

const pickEnum = (value, allowed, fallback) =>
  allowed.includes(value) ? value : fallback;

function cleanStringIds(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id) => typeof id === 'string' && id !== ''))];
}

function cleanPeriodNumbers(raw) {
  if (!Array.isArray(raw)) return [];
  const numbers = raw.filter((n) => Number.isInteger(n) && n >= 1);
  return [...new Set(numbers)].sort((a, b) => a - b);
}

const asPeriod = (value) =>
  Number.isInteger(value) && value >= 1 ? value : null;

function cleanFilter(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  if (typeof raw.parameterId !== 'string' || !OPERATOR_VALUES.has(raw.op)) return null;
  if (!OPERATORS_WITH_VALUE.has(raw.op)) {
    return { parameterId: raw.parameterId, op: raw.op };
  }
  if (typeof raw.value !== 'number' || !Number.isFinite(raw.value)) return null;
  return { parameterId: raw.parameterId, op: raw.op, value: raw.value };
}

function cleanChart(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  if (!CHART_KINDS.includes(raw.kind)) return null;
  return {
    kind: raw.kind,
    parameterIds: cleanStringIds(raw.parameterIds),
    periodNumber: asPeriod(raw.periodNumber),
    comparisonShape: pickEnum(raw.comparisonShape, COMPARISON_SHAPES, 'bar'),
    heatmapAxis: pickEnum(raw.heatmapAxis, HEATMAP_AXES, 'period'),
    imageFormat: pickEnum(raw.imageFormat, IMAGE_FORMATS, 'png'),
  };
}

function normalizeStudents(raw = {}) {
  const ids = cleanStringIds(raw.ids);
  const groupId = typeof raw.groupId === 'string' && raw.groupId !== '' ? raw.groupId : null;
  let mode = pickEnum(raw.mode, STUDENT_MODES, 'all');
  if (mode === 'group' && !groupId) mode = 'all';
  if (mode === 'selection' && ids.length === 0) mode = 'all';
  return { mode, groupId, ids };
}

function normalizeParameters(raw = {}) {
  const ids = cleanStringIds(raw.ids);
  let mode = pickEnum(raw.mode, PARAMETER_MODES, 'all');
  if (mode === 'selection' && ids.length === 0) mode = 'all';
  return { mode, ids };
}

function normalizePeriods(raw = {}) {
  const numbers = cleanPeriodNumbers(raw.numbers);
  let from = asPeriod(raw.from);
  let to = asPeriod(raw.to);
  let mode = pickEnum(raw.mode, PERIOD_MODES, 'all');
  if (mode === 'range') {
    if (from === null || to === null) mode = 'all';
    else if (from > to) [from, to] = [to, from];
  }
  if (mode === 'selection' && numbers.length === 0) mode = 'all';
  return { mode, from, to, numbers };
}

export function normalizeExportConfig(raw) {
  const base = defaultExportConfig();
  if (raw === null || typeof raw !== 'object') return base;
  const include = raw.include ?? {};
  const charts = Array.isArray(raw.charts)
    ? raw.charts.map(cleanChart).filter(Boolean).slice(0, MAX_CHARTS)
    : [];
  return {
    students: normalizeStudents(raw.students),
    parameters: normalizeParameters(raw.parameters),
    periods: normalizePeriods(raw.periods),
    filters: Array.isArray(raw.filters) ? raw.filters.map(cleanFilter).filter(Boolean) : [],
    include: {
      data: include.data !== false,
      delta: include.delta === true,
      trackingLog: include.trackingLog === true,
      auditTrail: include.auditTrail === true,
    },
    layout: pickEnum(raw.layout, LAYOUTS, 'wide'),
    tabularFormat: pickEnum(raw.tabularFormat, TABULAR_FORMATS, 'csv'),
    charts,
  };
}

// Overlay an entry-point prefill (from a page deep-link) onto a base config,
// merging the nested scope objects rather than replacing them wholesale, then
// normalise the result so the page always starts from a valid config.
export function mergePrefill(partial, base = defaultExportConfig()) {
  if (partial === null || typeof partial !== 'object') return normalizeExportConfig(base);
  return normalizeExportConfig({
    ...base,
    ...partial,
    students: { ...base.students, ...partial.students },
    parameters: { ...base.parameters, ...partial.parameters },
    periods: { ...base.periods, ...partial.periods },
    include: { ...base.include, ...partial.include },
    filters: partial.filters ?? base.filters,
    charts: partial.charts ?? base.charts,
  });
}

// True when the run would produce at least one tabular artifact.
export function includesTabular(config) {
  const { data, delta, trackingLog, auditTrail } = config.include;
  return data || delta || trackingLog || auditTrail;
}

// Human-readable reasons the config can't be run yet; empty array = runnable.
export function exportConfigErrors(config) {
  const errors = [];
  if (!includesTabular(config) && config.charts.length === 0) {
    errors.push('Choose at least one thing to export — data, changes, or a chart.');
  }
  for (const chart of config.charts) {
    if ((chart.kind === 'trend' || chart.kind === 'comparison') && chart.parameterIds.length === 0) {
      errors.push('Each trend or comparison chart needs at least one parameter.');
      break;
    }
  }
  return errors;
}
