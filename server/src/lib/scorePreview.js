// Build the per-cell preview for a bulk dry-run.
//
// `canViewScores` gates whether the *existing* score is revealed. A "blind
// entry" role (scores.enter without scores.view) may type scores but must not
// be able to read them back — see PREREQUISITES in lib/permissions.js. For such
// a user we redact `from` and collapse the status to a neutral 'save' so the
// preview never leaks the current value, nor whether the typed value matches
// it. Locked cells stay flagged (the save path still needs an override), but
// without the timestamp, which would itself hint that a value exists.
export function previewCells({
  entries,
  existing,
  problemIndexes,
  canViewScores = true,
}) {
  const cells = [];

  entries.forEach((entry, index) => {
    if (problemIndexes.has(index)) return;

    const row = existing.get(`${entry.studentId}:${entry.parameterId}`);
    const from = row?.value ?? null;

    let status;
    if (canViewScores) {
      if (from === entry.value) status = 'unchanged';
      else if (row?.isLocked) status = 'locked';
      else if (from === null) status = 'new';
      else status = 'change';
    } else {
      status = row?.isLocked ? 'locked' : 'save';
    }

    cells.push({
      index,
      studentId: entry.studentId,
      parameterId: entry.parameterId,
      status,
      from: canViewScores ? from : null,
      to: entry.value,
      ...(status === 'locked' && canViewScores ? { lockedAt: row.lockedAt } : {}),
    });
  });
  return cells;
}

export function previewCounts(cells, problems) {
  const counts = {
    new: 0,
    change: 0,
    unchanged: 0,
    locked: 0,
    save: 0,
    problems: problems.length,
  };
  for (const cell of cells) counts[cell.status]++;
  return counts;
}