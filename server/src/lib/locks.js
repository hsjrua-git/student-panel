export const NORMAL_LOCK_DAYS = 7;
export const LATE_LOCK_DAYS = 1;
export const MIN_REASON = 5;
export const MAX_REASON = 300;

export function lockDaysFor({ periodNumber, currentPeriod }) {
  return periodNumber === currentPeriod ? NORMAL_LOCK_DAYS : LATE_LOCK_DAYS;
}

export function findLockedChanges({ entries, existing }) {
  const locked = [];
  entries.forEach((entry, index) => {
    const row = existing.get(`${entry.studentId}:${entry.parameterId}`);
    if (!row || !row.isLocked) return;
    const valueChanged = entry.value !== row.value;
    // Only weigh the note if the entry actually carries one (CSV import does
    // not touch notes, so it must not look like a note was cleared).
    const commentChanged =
      'comment' in entry &&
      (entry.comment ?? null) !== (row.comment ?? null);
    if (!valueChanged && !commentChanged) return;
    locked.push({
      index,
      studentId: entry.studentId,
      parameterId: entry.parameterId,
      lockedAt: row.lockedAt,
    });
  });
  return locked;
}

export function parseOverrideReason(input) {
  const message = `Changing locked scores needs a written reason of ${MIN_REASON} to ${MAX_REASON} characters.`;
  if (typeof input !== 'string') return { error: message };
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length < MIN_REASON || value.length > MAX_REASON) {
    return { error: message };
  }
  return { value };
}