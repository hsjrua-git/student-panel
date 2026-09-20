function round(number) {
  return Math.round(number * 100) / 100;
}

export function percentOfRange(value, minValue, maxValue) {
  if (value === null || minValue === null || maxValue === null) return null;
  if (maxValue <= minValue) return null;
  const percent = ((value - minValue) * 100) / (maxValue - minValue);
  return Math.min(100, Math.max(0, percent));
}

export function periodView({ periodNumber, evaluations, periods, parameters }) {
  const period = periods.find((item) => item.number === periodNumber);
  const inUse = new Set(period?.parameterIds ?? []);
  const valueOf = new Map(
    evaluations.map((item) => [
      `${item.periodNumber}:${item.parameterId}`,
      item.value,
    ])
  );

  return parameters
    .filter(
      (parameter) =>
        inUse.has(parameter.id) || valueOf.has(`${periodNumber}:${parameter.id}`)
    )
    .map((parameter) => {
      const value = valueOf.get(`${periodNumber}:${parameter.id}`) ?? null;
      const previous =
        valueOf.get(`${periodNumber - 1}:${parameter.id}`) ?? null;
      return {
        parameter,
        inUse: inUse.has(parameter.id),
        value,
        previous,
        change:
          value !== null && previous !== null ? round(value - previous) : null,
        percent: percentOfRange(value, parameter.minValue, parameter.maxValue),
      };
    });
}

export function parameterView({ parameterId, evaluations, periods }) {
  const valueOf = new Map(
    evaluations
      .filter((item) => item.parameterId === parameterId)
      .map((item) => [item.periodNumber, item.value])
  );
  if (valueOf.size === 0) return { points: [], stats: null };

  const firstScored = Math.min(...valueOf.keys());
  const points = periods
    .filter(
      (period) =>
        period.number >= firstScored &&
        (period.parameterIds.includes(parameterId) || valueOf.has(period.number))
    )
    .map((period) => ({
      periodNumber: period.number,
      startDate: period.startDate,
      endDate: period.endDate,
      value: valueOf.get(period.number) ?? null,
    }));

  const scored = points.filter((point) => point.value !== null);
  if (scored.length === 0) return { points, stats: null };

  const first = scored[0];
  const latest = scored[scored.length - 1];
  const sum = scored.reduce((total, point) => total + point.value, 0);

  return {
    points,
    stats: {
      count: scored.length,
      first: { periodNumber: first.periodNumber, value: first.value },
      latest: { periodNumber: latest.periodNumber, value: latest.value },
      average: round(sum / scored.length),
      change: scored.length > 1 ? round(latest.value - first.value) : null,
    },
  };
}