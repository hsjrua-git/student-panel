const NUMBER_PATTERN = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

// The evaluation matrix is scoped to one group + one period. A column is either
// the group's own direct score (studentId null) or a member's score within the
// group. The cell key folds the group-own column onto the sentinel 'group' so
// draft maps, lock maps and the server's cells map all share one key space.
export function cellKey(studentId, parameterId) {
  return `${studentId ?? 'group'}:${parameterId}`;
}

// Inverse of cellKey. parameterId is a UUID (no colon), so we split on the
// first colon only and map the sentinel back to a null studentId.
export function splitCellKey(key) {
  const index = key.indexOf(':');
  const studentPart = key.slice(0, index);
  return {
    studentId: studentPart === 'group' ? null : studentPart,
    parameterId: key.slice(index + 1),
  };
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

// Collect value-only drafts into bulk entries for one group. Each entry carries
// the constant groupId and the per-cell studentId (null = the group's own row).
export function buildEntries(drafts, parametersById, groupId) {
  const entries = [];
  const errors = {};

  for (const [key, text] of Object.entries(drafts)) {
    const { studentId, parameterId } = splitCellKey(key);
    const parameter = parametersById.get(parameterId);
    if (!parameter) continue;

    const result = parseCell(text, parameter);
    if (result.error) {
      errors[key] = result.error;
    } else {
      entries.push({ groupId, studentId, parameterId, value: result.value });
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
// edit re-sends the unchanged saved value so the row is not cleared. Every
// entry carries the constant groupId of the matrix being edited.
export function buildSavePayload({
  drafts,
  noteDrafts,
  savedValues,
  parametersById,
  groupId,
}) {
  const keys = new Set([...Object.keys(drafts), ...Object.keys(noteDrafts)]);
  const entries = [];
  const errors = {};

  for (const key of keys) {
    const { studentId, parameterId } = splitCellKey(key);
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

    const entry = { groupId, studentId, parameterId, value };
    if (key in noteDrafts) {
      const text = noteDrafts[key].trim();
      entry.comment = text === '' ? null : text;
    }
    entries.push(entry);
  }
  return { entries, errors };
}
