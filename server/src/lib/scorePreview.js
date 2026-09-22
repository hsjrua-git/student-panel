export function previewCells({ entries, existing, problemIndexes }) {
  const cells = [];

  entries.forEach((entry, index) => {
    if (problemIndexes.has(index)) return;

    const row = existing.get(`${entry.studentId}:${entry.parameterId}`);
    const from = row?.value ?? null;

    let status;
    if (from === entry.value) status = 'unchanged';
    else if (row?.isLocked) status = 'locked';
    else if (from === null) status = 'new';
    else status = 'change';

    cells.push({
      index,
      studentId: entry.studentId,
      parameterId: entry.parameterId,
      status,
      from,
      to: entry.value,
      ...(status === 'locked' ? { lockedAt: row.lockedAt } : {}),
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
    problems: problems.length,
  };
  for (const cell of cells) counts[cell.status]++;
  return counts;
}