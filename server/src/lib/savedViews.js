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
  if (typeof input !== 'string') {
    return { error: 'A name is required.', code: 'VALIDATION_REQUIRED' };
  }
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length < 1 || value.length > 60) {
    return {
      error: 'The name must be 1 to 60 characters.',
      code: 'VALIDATION_INVALID_LENGTH',
      params: { min: 1, max: 60 },
    };
  }
  return { value };
}

function parseFilter(input) {
  if (input === null || typeof input !== 'object') {
    return {
      error: 'Each filter must be an object.',
      code: 'VALIDATION_INVALID_TYPE',
    };
  }
  if (!isUuid(input.parameterId)) {
    return {
      error: 'Each filter needs a valid parameterId.',
      code: 'VALIDATION_INVALID_FORMAT',
      params: { field: 'parameterId' },
    };
  }
  if (!OPERATORS.includes(input.op)) {
    return {
      error: `A filter condition must be one of: ${OPERATORS.join(', ')}.`,
      code: 'VALIDATION_INVALID_CHOICE',
    };
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
    return {
      error: 'This filter needs a number as its value.',
      code: 'VALIDATION_INVALID_TYPE',
    };
  }
  return { value: { parameterId: input.parameterId, op: input.op, value } };
}

export function parseViewConfig(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return {
      error: 'The view settings are missing.',
      code: 'VALIDATION_REQUIRED',
    };
  }

  const { periodMode = 'current' } = input;
  if (periodMode !== 'current' && periodMode !== 'fixed') {
    return {
      error: 'periodMode must be "current" or "fixed".',
      code: 'VALIDATION_INVALID_CHOICE',
    };
  }
  let periodNumber = null;
  if (periodMode === 'fixed') {
    if (!isValidPeriodNumber(input.periodNumber)) {
      return {
        error: `A fixed period must be a whole number from 1 to ${MAX_PERIOD}.`,
        code: 'VALIDATION_INVALID_RANGE',
        params: { min: 1, max: MAX_PERIOD },
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
    return {
      error: 'parameterIds must be a list of unique valid IDs.',
      code: 'VALIDATION_INVALID_FORMAT',
      params: { field: 'parameterIds' },
    };
  }

  const rawFilters = input.filters ?? [];
  if (!Array.isArray(rawFilters) || rawFilters.length > MAX_FILTERS) {
    return {
      error: `Use at most ${MAX_FILTERS} filters.`,
      code: 'VALIDATION_TOO_LONG',
      params: { max: MAX_FILTERS },
    };
  }
  const filters = [];
  for (const raw of rawFilters) {
    const parsed = parseFilter(raw);
    if (parsed.error) {
      return { error: parsed.error, code: parsed.code, params: parsed.params };
    }
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
      code: 'VALIDATION_INVALID_CHOICE',
    };
  }

  const search = input.search ?? '';
  if (typeof search !== 'string' || search.trim().length > MAX_SEARCH) {
    return {
      error: `The search text can be at most ${MAX_SEARCH} characters.`,
      code: 'VALIDATION_TOO_LONG',
      params: { max: MAX_SEARCH },
    };
  }

  const showChange = input.showChange ?? false;
  if (typeof showChange !== 'boolean') {
    return {
      error: 'showChange must be true or false.',
      code: 'VALIDATION_INVALID_TYPE',
    };
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