export function buildHistory({ evaluations, periods, parameters }) {
  const valueByCell = new Map(
    evaluations.map((item) => [
      `${item.periodNumber}:${item.parameterId}`,
      item.value,
    ])
  );
  const scoredIds = new Set(evaluations.map((item) => item.parameterId));
  const usedAnywhere = new Set(periods.flatMap((period) => period.parameterIds));

  const columns = parameters.filter(
    (parameter) => usedAnywhere.has(parameter.id) || scoredIds.has(parameter.id)
  );

  const rows = periods.map((period) => {
    const inUse = new Set(period.parameterIds);
    const cells = {};
    for (const parameter of columns) {
      const key = `${period.number}:${parameter.id}`;
      if (valueByCell.has(key)) {
        cells[parameter.id] = { state: 'value', value: valueByCell.get(key) };
      } else if (inUse.has(parameter.id)) {
        cells[parameter.id] = { state: 'missing' };
      } else {
        cells[parameter.id] = { state: 'unused' };
      }
    }
    return {
      periodNumber: period.number,
      startDate: period.startDate,
      endDate: period.endDate,
      cells,
    };
  });

  return { columns, rows };
}

export function visibleRows(rows, evaluations, showAll) {
  if (showAll || rows.length === 0) return rows;

  const scored = evaluations.map((item) => item.periodNumber);
  const first =
    scored.length > 0
      ? Math.min(...scored)
      : rows[rows.length - 1].periodNumber;
  return rows.filter((row) => row.periodNumber >= first);
}