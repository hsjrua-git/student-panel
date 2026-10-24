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
      return {
        error: `Name must be between 1 and ${MAX_NAME} characters.`,
        code: 'VALIDATION_INVALID_LENGTH',
        params: { min: 1, max: MAX_NAME },
      };
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
      return {
        error: `Unit must be text of at most ${MAX_UNIT} characters.`,
        code: 'VALIDATION_TOO_LONG',
        params: { max: MAX_UNIT },
      };
    }
  }

  for (const key of ['minValue', 'maxValue']) {
    if (key in input) {
      if (input[key] === null) {
        values[key] = null;
      } else if (typeof input[key] === 'number' && Number.isFinite(input[key])) {
        values[key] = input[key];
      } else {
        return {
          error: `${key} must be a number or null.`,
          code: 'VALIDATION_INVALID_TYPE',
          params: { field: key },
        };
      }
    }
  }
  if (
    values.minValue != null &&
    values.maxValue != null &&
    values.minValue > values.maxValue
  ) {
    return {
      error: 'The minimum cannot be larger than the maximum.',
      code: 'PARAMETERS_MIN_ABOVE_MAX',
    };
  }

  if ('sortOrder' in input) {
    if (!Number.isInteger(input.sortOrder)) {
      return {
        error: 'sortOrder must be a whole number.',
        code: 'VALIDATION_INVALID_TYPE',
        params: { field: 'sortOrder' },
      };
    }
    values.sortOrder = input.sortOrder;
  }

  return { values };
}
