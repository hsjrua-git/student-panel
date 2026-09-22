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

// A cell counts as "changed" if its value OR its note has an unsaved edit.
export function lockedDraftKeys(drafts, noteDrafts, locks) {
  const keys = new Set([...Object.keys(drafts), ...Object.keys(noteDrafts)]);
  return [...keys].filter((key) => locks[key]?.isLocked === true);
}

// Build the save payload from both value edits and note edits. A value-only
// edit sends no `comment` (the server keeps the existing note); a note-only
// edit re-sends the unchanged saved value so the row is not cleared.
export function buildSavePayload({
  drafts,
  noteDrafts,
  savedValues,
  parametersById,
}) {
  const keys = new Set([...Object.keys(drafts), ...Object.keys(noteDrafts)]);
  const entries = [];
  const errors = {};

  for (const key of keys) {
    const [studentId, parameterId] = key.split(':');
    const parameter = parametersById.get(parameterId);
    if (!parameter) continue;

    let value;
    if (key in drafts) {
      const result = parseCell(drafts[key], parameter);
      if (result.error) {
        errors[key] = result.error;
        continue;
      }
      value = result.value;
    } else {
      value = savedValues[key] ?? null;
    }

    const entry = { studentId, parameterId, value };
    if (key in noteDrafts) {
      const text = noteDrafts[key].trim();
      entry.comment = text === '' ? null : text;
    }
    entries.push(entry);
  }
  return { entries, errors };
}