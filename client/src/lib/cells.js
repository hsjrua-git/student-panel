const NUMBER_PATTERN = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

export function cellKey(studentId, parameterId) {
  return `${studentId}:${parameterId}`;
}

export function savedText(value) {
  return value === null || value === undefined ? '' : String(value);
}

export function parseCell(text, parameter) {
  const trimmed = text.trim();
  if (trimmed === '') return { value: null };
  if (!NUMBER_PATTERN.test(trimmed)) return { error: 'Enter a number.' };

  const value = Number(trimmed.replace(',', '.'));
  if (parameter.minValue !== null && value < parameter.minValue) {
    return { error: `At least ${parameter.minValue}.` };
  }
  if (parameter.maxValue !== null && value > parameter.maxValue) {
    return { error: `At most ${parameter.maxValue}.` };
  }
  return { value };
}

export function buildEntries(drafts, parametersById) {
  const entries = [];
  const errors = {};

  for (const [key, text] of Object.entries(drafts)) {
    const [studentId, parameterId] = key.split(':');
    const parameter = parametersById.get(parameterId);
    if (!parameter) continue;

    const result = parseCell(text, parameter);
    if (result.error) {
      errors[key] = result.error;
    } else {
      entries.push({ studentId, parameterId, value: result.value });
    }
  }
  return { entries, errors };
}
export function cellAccess(lock, canOverride) {
  if (!lock || !lock.isLocked) return 'open';
  return canOverride ? 'override' : 'locked';
}

export function lockedDraftKeys(drafts, locks) {
  return Object.keys(drafts).filter((key) => locks[key]?.isLocked === true);
}