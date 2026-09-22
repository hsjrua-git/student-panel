import { isUuid } from './ids.js';

export const MAX_ENTRIES = 5000;
export const MAX_COMMENT = 500;
const MAX_ABS_VALUE = 1_000_000_000;

// A note is optional. Returns the cleaned note (or null) — treat missing,
// null, or blank all as "no note".
export function normalizeComment(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return undefined; // signals invalid
  const value = raw.trim();
  return value === '' ? null : value;
}

export function validateShape(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return 'entries must be a non-empty list.';
  }
  if (entries.length > MAX_ENTRIES) {
    return `Too many entries (the maximum is ${MAX_ENTRIES}).`;
  }

  for (const entry of entries) {
    if (!isUuid(entry?.studentId)) {
      return 'Every entry needs a valid studentId.';
    }
    if (!isUuid(entry.parameterId)) {
      return 'Every entry needs a valid parameterId.';
    }

    // Every entry must carry an explicit `value` — a number, or null to clear
    // the cell. A missing key is a malformed request (the client always sends
    // one), so reject it rather than silently treating it as null.
    if (!('value' in entry)) {
      return 'Every entry needs a value (a number or null).';
    }
    const { value } = entry;
    const isNumber = typeof value === 'number' && Number.isFinite(value);
    if (value !== null && !isNumber) {
      return 'Every value must be a number or null.';
    }
    if (isNumber && Math.abs(value) > MAX_ABS_VALUE) {
      return 'A value is outside the supported range.';
    }

    if ('comment' in entry) {
      const comment = normalizeComment(entry.comment);
      if (comment === undefined) {
        return 'A note must be text or empty.';
      }
      if (comment !== null && comment.length > MAX_COMMENT) {
        return `A note is too long (the maximum is ${MAX_COMMENT} characters).`;
      }
    }
  }
  return null;
}

export function findProblems({
  entries,
  usedParameters,
  knownStudentIds,
  periodNumber,
}) {
  const problems = [];
  const seen = new Set();

  entries.forEach((entry, index) => {
    function report(message) {
      problems.push({
        index,
        studentId: entry.studentId,
        parameterId: entry.parameterId,
        message,
      });
    }

    const key = `${entry.studentId}:${entry.parameterId}`;
    if (seen.has(key)) {
      report('This student and parameter appear more than once.');
      return;
    }
    seen.add(key);

    if (!knownStudentIds.has(entry.studentId)) {
      report('Student not found.');
      return;
    }

    const parameter = usedParameters.get(entry.parameterId);
    if (!parameter) {
      report(`This parameter is not used in Period ${periodNumber}.`);
      return;
    }

    if (entry.value === null) return;

    if (parameter.minValue !== null && entry.value < parameter.minValue) {
      report(`${parameter.name} must be at least ${parameter.minValue}.`);
    } else if (parameter.maxValue !== null && entry.value > parameter.maxValue) {
      report(`${parameter.name} must be at most ${parameter.maxValue}.`);
    }
  });

  return problems;
}