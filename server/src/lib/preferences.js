import { isUuid } from './ids.js';

export const THEMES = ['system', 'light', 'dark'];
export const PAGE_SIZES = [10, 25, 50, 100];
export const SORTS = ['newest', 'oldest', 'name', 'code'];
export const TABS = ['overview', 'period', 'parameter'];
export const CSV_DELIMITERS = [',', ';'];
const MAX_HIDDEN = 200;

export const DEFAULT_PREFERENCES = {
  theme: 'system',
  studentsPageSize: 25,
  studentsSort: 'newest',
  studentsShowCode: true,
  studentsShowAdded: true,
  studentDefaultTab: 'overview',
  studentShowAllPeriods: false,
  hiddenParameterIds: [],
  csvDelimiter: ',',
};

const CHECKS = {
  theme: (value) => THEMES.includes(value),
  studentsPageSize: (value) => PAGE_SIZES.includes(value),
  studentsSort: (value) => SORTS.includes(value),
  studentsShowCode: (value) => typeof value === 'boolean',
  studentsShowAdded: (value) => typeof value === 'boolean',
  studentDefaultTab: (value) => TABS.includes(value),
  studentShowAllPeriods: (value) => typeof value === 'boolean',
  csvDelimiter: (value) => CSV_DELIMITERS.includes(value),
  hiddenParameterIds: (value) =>
    Array.isArray(value) &&
    value.length <= MAX_HIDDEN &&
    value.every(isUuid) &&
    new Set(value).size === value.length,
};

export function parsePreferencesUpdate(body) {
  const isObject =
    body !== null && typeof body === 'object' && !Array.isArray(body);
  if (!isObject) return { error: 'Send an object with the settings to change.' };

  const values = {};
  for (const [key, value] of Object.entries(body)) {
    if (!Object.hasOwn(CHECKS, key)) return { error: `Unknown setting: ${key}.` };
    if (!CHECKS[key](value)) return { error: `Invalid value for ${key}.` };
    values[key] = value;
  }
  if (Object.keys(values).length === 0) return { error: 'Nothing to change.' };
  return { values };
}

export function mergePreferences(stored) {
  const result = { ...DEFAULT_PREFERENCES, hiddenParameterIds: [] };
  if (stored !== null && typeof stored === 'object') {
    for (const key of Object.keys(CHECKS)) {
      if (Object.hasOwn(stored, key) && CHECKS[key](stored[key])) {
        result[key] = stored[key];
      }
    }
  }
  return result;
}