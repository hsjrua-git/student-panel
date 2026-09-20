const MAX_NAME = 60;
const MAX_UNIT = 20;

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

  for (const key of ['minValue', 'maxValue']) {
    if (key in input) {
      if (input[key] === null) {
        values[key] = null;
      } else if (typeof input[key] === 'number' && Number.isFinite(input[key])) {
        values[key] = input[key];
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

  if ('sortOrder' in input) {
    if (!Number.isInteger(input.sortOrder)) {
      return { error: 'sortOrder must be a whole number.' };
    }
    values.sortOrder = input.sortOrder;
  }

  return { values };
}