const MAX_NAME = 60;
const MAX_UNIT = 20;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Parse and validate a parameter create/update body. Numeric fields (min/max
// range and the norm band) accept a number or null; the DB CHECKs enforce
// min<=max and norm_min<=norm_max, and we mirror those here for a friendly error.
// `parentId` places the parameter in the tree (null = a root); `extra` holds any
// other custom fields. The route still confirms the parent exists in the DB.
export function parseParameterInput(body, { partial = false } = {}) {
  const input = body ?? {};
  const values = {};

  if (!partial || 'name' in input) {
    const name =
      typeof input.name === 'string'
        ? input.name.trim().replace(/\s+/g, ' ')
        : '';
    if (name.length < 1 || name.length > MAX_NAME) {
      return { error: `Name must be between 1 and ${MAX_NAME} characters.` };
    }
    values.name = name;
  }

  if ('parentId' in input) {
    if (input.parentId === null || input.parentId === '') {
      values.parentId = null;
    } else if (typeof input.parentId === 'string' && UUID_PATTERN.test(input.parentId)) {
      values.parentId = input.parentId;
    } else {
      return { error: 'Choose a valid parent parameter.' };
    }
  }

  if ('extra' in input) {
    if (input.extra === null || input.extra === undefined) {
      values.extra = {};
    } else if (typeof input.extra === 'object' && !Array.isArray(input.extra)) {
      values.extra = input.extra;
    } else {
      return { error: 'extra must be an object.' };
    }
  }

  if ('unit' in input) {
    if (input.unit === null || input.unit === '') {
      values.unit = null;
    } else if (
      typeof input.unit === 'string' &&
      input.unit.trim().length <= MAX_UNIT
    ) {
      values.unit = input.unit.trim();
    } else {
      return { error: `Unit must be text of at most ${MAX_UNIT} characters.` };
    }
  }

  for (const key of ['minValue', 'maxValue', 'normMin', 'normMax']) {
    if (key in input) {
      if (input[key] === null || input[key] === '') {
        values[key] = null;
      } else if (typeof input[key] === 'number' && Number.isFinite(input[key])) {
        values[key] = input[key];
      } else if (typeof input[key] === 'string' && input[key].trim() !== '' && Number.isFinite(Number(input[key]))) {
        values[key] = Number(input[key]);
      } else {
        return { error: `${key} must be a number or null.` };
      }
    }
  }
  if (
    values.minValue != null &&
    values.maxValue != null &&
    values.minValue > values.maxValue
  ) {
    return { error: 'The minimum cannot be larger than the maximum.' };
  }
  if (
    values.normMin != null &&
    values.normMax != null &&
    values.normMin > values.normMax
  ) {
    return { error: 'The norm minimum cannot be larger than the norm maximum.' };
  }

  if ('sortOrder' in input) {
    if (!Number.isInteger(input.sortOrder)) {
      return { error: 'sortOrder must be a whole number.' };
    }
    values.sortOrder = input.sortOrder;
  }

  return { values };
}
