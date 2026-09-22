export const OPERATORS = [
  { value: 'lt', label: 'is below', symbol: '<', needsValue: true },
  { value: 'lte', label: 'is at most', symbol: '≤', needsValue: true },
  { value: 'gt', label: 'is above', symbol: '>', needsValue: true },
  { value: 'gte', label: 'is at least', symbol: '≥', needsValue: true },
  { value: 'eq', label: 'equals', symbol: '=', needsValue: true },
  { value: 'missing', label: 'was not measured', symbol: null, needsValue: false },
  { value: 'present', label: 'was measured', symbol: null, needsValue: false },
];

export const MAX_FILTERS = 10;

const OPERATOR_BY_VALUE = new Map(OPERATORS.map((item) => [item.value, item]));

const COMPARE = {
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  eq: (a, b) => a === b,
};

function round(number) {
  return Math.round(number * 100) / 100;
}

let nextKey = 1;
export function newFilterKey() {
  return `f${nextKey++}`;
}

export function defaultConfig() {
  return {
    periodMode: 'current',
    periodNumber: null,
    parameterIds: [],
    filters: [],
    sort: { key: 'name', direction: 'asc' },
    search: '',
    showChange: false,
  };
}

function cleanFilter(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  const operator = OPERATOR_BY_VALUE.get(raw.op);
  if (typeof raw.parameterId !== 'string' || !operator) return null;
  if (!operator.needsValue) return { parameterId: raw.parameterId, op: raw.op };
  if (typeof raw.value !== 'number' || !Number.isFinite(raw.value)) return null;
  return { parameterId: raw.parameterId, op: raw.op, value: raw.value };
}

export function normalizeConfig(raw) {
  const base = defaultConfig();
  if (raw === null || typeof raw !== 'object') return base;

  const isFixed =
    raw.periodMode === 'fixed' &&
    Number.isInteger(raw.periodNumber) &&
    raw.periodNumber >= 1;
  const sort = raw.sort;
  const sortOk =
    sort !== null &&
    typeof sort === 'object' &&
    typeof sort.key === 'string' &&
    (sort.direction === 'asc' || sort.direction === 'desc');

  return {
    periodMode: isFixed ? 'fixed' : 'current',
    periodNumber: isFixed ? raw.periodNumber : null,
    parameterIds: Array.isArray(raw.parameterIds)
      ? raw.parameterIds.filter((id) => typeof id === 'string')
      : [],
    filters: Array.isArray(raw.filters)
      ? raw.filters.map(cleanFilter).filter(Boolean)
      : [],
    sort: sortOk ? { key: sort.key, direction: sort.direction } : base.sort,
    search: typeof raw.search === 'string' ? raw.search.trim() : '',
    showChange: raw.showChange === true,
  };
}

export function withFilterKeys(config) {
  return {
    ...config,
    filters: config.filters.map((filter) => ({ ...filter, key: newFilterKey() })),
  };
}

export function sameConfig(a, b) {
  return JSON.stringify(normalizeConfig(a)) === JSON.stringify(normalizeConfig(b));
}

export function toggleSort(sort, key) {
  if (sort.key === key) {
    return { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: 'asc' };
}

export function toggleColumn(selectedIds, allIds, parameterId, shouldShow) {
  const current =
    selectedIds.length === 0
      ? allIds
      : selectedIds.filter((id) => allIds.includes(id));
  const next = shouldShow
    ? [...new Set([...current, parameterId])]
    : current.filter((id) => id !== parameterId);

  if (!shouldShow && next.length === 0) return selectedIds;
  return next.length === allIds.length ? [] : next;
}

export function changeOf(row, parameterId) {
  const now = row.values[parameterId];
  const before = row.previous[parameterId];
  if (now === undefined || before === undefined) return null;
  return round(now - before);
}

export function describeFilter(filter, parametersById) {
  const name = parametersById.get(filter.parameterId)?.name ?? 'Unknown parameter';
  const operator = OPERATOR_BY_VALUE.get(filter.op);
  if (!operator) return name;
  if (operator.needsValue) return `${name} ${operator.symbol} ${filter.value}`;
  return `${name} ${filter.op === 'missing' ? 'not measured' : 'measured'}`;
}

function matchesFilter(row, filter) {
  const value = row.values[filter.parameterId];
  const has = value !== undefined && value !== null;
  if (filter.op === 'missing') return !has;
  if (filter.op === 'present') return has;
  return has && COMPARE[filter.op](value, filter.value);
}

function normalizeCode(text) {
  return text.replace(/[-\s]/g, '').toLowerCase();
}

export function applyView({ students, parameters, config }) {
  const known = new Set(parameters.map((parameter) => parameter.id));
  const cleaned = config.filters.map(cleanFilter).filter(Boolean);
  const activeFilters = cleaned.filter((filter) => known.has(filter.parameterId));
  const ignoredFilters = config.filters.length - activeFilters.length;

  const needle = config.search.trim().toLowerCase();
  const codeNeedle = normalizeCode(needle);

  const matching = students.filter((row) => {
    if (needle) {
      const nameMatch = row.fullName.toLowerCase().includes(needle);
      const codeMatch =
        codeNeedle !== '' && row.studentCode.toLowerCase().includes(codeNeedle);
      if (!nameMatch && !codeMatch) return false;
    }
    return activeFilters.every((filter) => matchesFilter(row, filter));
  });

  const direction = config.sort.direction === 'desc' ? -1 : 1;
  const key = config.sort.key;
  const byName = (a, b) =>
    a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }) ||
    a.id.localeCompare(b.id);

  let compare;
  if (key === 'name') {
    compare = (a, b) => byName(a, b) * direction;
  } else if (key === 'code') {
    compare = (a, b) => a.studentCode.localeCompare(b.studentCode) * direction || byName(a, b);
  } else if (known.has(key)) {
    compare = (a, b) => {
      const hasA = a.values[key] !== undefined;
      const hasB = b.values[key] !== undefined;
      if (!hasA && !hasB) return byName(a, b);
      if (!hasA) return 1;
      if (!hasB) return -1;
      return (a.values[key] - b.values[key]) * direction || byName(a, b);
    };
  } else {
    compare = byName;
  }
  const rows = [...matching].sort(compare);

  const stats = {};
  for (const parameter of parameters) {
    const measured = rows
      .map((row) => row.values[parameter.id])
      .filter((value) => value !== undefined && value !== null);
    stats[parameter.id] =
      measured.length === 0
        ? { count: 0, average: null, min: null, max: null }
        : {
            count: measured.length,
            average: round(measured.reduce((sum, value) => sum + value, 0) / measured.length),
            min: Math.min(...measured),
            max: Math.max(...measured),
          };
  }

  return { rows, stats, ignoredFilters };
}