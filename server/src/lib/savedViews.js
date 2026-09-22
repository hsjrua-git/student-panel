import { isUuid } from './ids.js';
import { MAX_PERIOD, isValidPeriodNumber } from './parameterUse.js';

export const MAX_VIEWS_PER_USER = 50;
export const OPERATORS = ['lt', 'lte', 'gt', 'gte', 'eq', 'missing', 'present'];

const VALUE_OPERATORS = new Set(['lt', 'lte', 'gt', 'gte', 'eq']);
const MAX_FILTERS = 10;
const MAX_COLUMNS = 100;
const MAX_SEARCH = 100;
const MAX_ABS_VALUE = 1_000_000_000;

export function parseViewName(input) {
  if (typeof input !== 'string') return { error: 'A name is required.' };
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length < 1 || value.length > 60) {
    return { error: 'The name must be 1 to 60 characters.' };
  }
  return { value };
}

function parseFilter(input) {
  if (input === null || typeof input !== 'object') {
    return { error: 'Each filter must be an object.' };
  }
  if (!isUuid(input.parameterId)) {
    return { error: 'Each filter needs a valid parameterId.' };
  }
  if (!OPERATORS.includes(input.op)) {
    return { error: `A filter condition must be one of: ${OPERATORS.join(', ')}.` };
  }
  if (!VALUE_OPERATORS.has(input.op)) {
    return { value: { parameterId: input.parameterId, op: input.op } };
  }

  const { value } = input;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Math.abs(value) > MAX_ABS_VALUE
  ) {
    return { error: 'This filter needs a number as its value.' };
  }
  return { value: { parameterId: input.parameterId, op: input.op, value } };
}

export function parseViewConfig(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'The view settings are missing.' };
  }

  const { periodMode = 'current' } = input;
  if (periodMode !== 'current' && periodMode !== 'fixed') {
    return { error: 'periodMode must be "current" or "fixed".' };
  }
  let periodNumber = null;
  if (periodMode === 'fixed') {
    if (!isValidPeriodNumber(input.periodNumber)) {
      return {
        error: `A fixed period must be a whole number from 1 to ${MAX_PERIOD}.`,
      };
    }
    periodNumber = input.periodNumber;
  }

  const parameterIds = input.parameterIds ?? [];
  if (
    !Array.isArray(parameterIds) ||
    parameterIds.length > MAX_COLUMNS ||
    !parameterIds.every(isUuid) ||
    new Set(parameterIds).size !== parameterIds.length
  ) {
    return { error: 'parameterIds must be a list of unique valid IDs.' };
  }

  const rawFilters = input.filters ?? [];
  if (!Array.isArray(rawFilters) || rawFilters.length > MAX_FILTERS) {
    return { error: `Use at most ${MAX_FILTERS} filters.` };
  }
  const filters = [];
  for (const raw of rawFilters) {
    const parsed = parseFilter(raw);
    if (parsed.error) return { error: parsed.error };
    filters.push(parsed.value);
  }

  const sort = input.sort ?? { key: 'name', direction: 'asc' };
  const isObject = sort !== null && typeof sort === 'object';
  const keyOk =
    isObject && (sort.key === 'name' || sort.key === 'code' || isUuid(sort.key));
  const directionOk =
    isObject && (sort.direction === 'asc' || sort.direction === 'desc');
  if (!keyOk || !directionOk) {
    return {
      error:
        'sort needs a key (name, code or a parameter ID) and a direction (asc or desc).',
    };
  }

  const search = input.search ?? '';
  if (typeof search !== 'string' || search.trim().length > MAX_SEARCH) {
    return { error: `The search text can be at most ${MAX_SEARCH} characters.` };
  }

  const showChange = input.showChange ?? false;
  if (typeof showChange !== 'boolean') {
    return { error: 'showChange must be true or false.' };
  }

  return {
    value: {
      periodMode,
      periodNumber,
      parameterIds,
      filters,
      sort: { key: sort.key, direction: sort.direction },
      search: search.trim(),
      showChange,
    },
  };
}