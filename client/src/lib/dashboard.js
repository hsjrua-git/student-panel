function round(number) {
  return Math.round(number * 100) / 100;
}

function sum(numbers) {
  return numbers.reduce((total, value) => total + value, 0);
}

export function summarize(results) {
  const inUse = results.parameters.filter((parameter) => parameter.inUse);
  const total = results.students.length;
  const expected = total * inUse.length;
  let measured = 0;
  let complete = 0;
  let partial = 0;
  let none = 0;

  for (const student of results.students) {
    const have = inUse.filter(
      (parameter) => student.values[parameter.id] !== undefined
    ).length;
    measured += have;
    if (inUse.length > 0 && have === inUse.length) complete++;
    else if (have > 0) partial++;
    else none++;
  }

  return {
    students: total,
    parametersInUse: inUse.length,
    expected,
    measured,
    completion: expected > 0 ? Math.round((measured * 100) / expected) : null,
    studentsComplete: complete,
    studentsPartial: partial,
    studentsNone: none,
  };
}

// One entry per student — the "living class field" on the dashboard hero. Each
// becomes a dot lit by how completely that student is measured this period,
// against the parameters in use (the same set summarize() counts against, so the
// three state buckets here add up to summarize's complete/partial/none totals).
// Roster order is preserved so a dot maps to a stable position across renders.
export function cohortField(results) {
  const inUse = results.parameters.filter((parameter) => parameter.inUse);
  return results.students.map((student) => {
    const measured = inUse.filter(
      (parameter) => student.values[parameter.id] !== undefined
    ).length;
    let state;
    if (inUse.length > 0 && measured === inUse.length) state = 'full';
    else if (measured > 0) state = 'partial';
    else state = 'none';
    return {
      id: student.id,
      fullName: student.fullName,
      studentCode: student.studentCode,
      measured,
      inUse: inUse.length,
      state,
    };
  });
}

export function parameterStats(results) {
  return results.parameters.map((parameter) => {
    const values = [];
    const changes = [];
    for (const student of results.students) {
      const now = student.values[parameter.id];
      const before = student.previous[parameter.id];
      if (now !== undefined) values.push(now);
      if (now !== undefined && before !== undefined) changes.push(now - before);
    }
    return {
      parameter,
      values,
      count: values.length,
      average: values.length ? round(sum(values) / values.length) : null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      paired: changes.length,
      averageChange: changes.length ? round(sum(changes) / changes.length) : null,
    };
  });
}

export function distribution(values, parameter, binCount = 5) {
  const hasRange =
    parameter.minValue !== null &&
    parameter.maxValue !== null &&
    parameter.maxValue > parameter.minValue;

  let lo;
  let hi;
  if (hasRange) {
    lo = parameter.minValue;
    hi = parameter.maxValue;
  } else if (values.length === 0) {
    return [];
  } else {
    lo = Math.min(...values);
    hi = Math.max(...values);
  }

  if (hi === lo) {
    return [{ from: lo, to: hi, label: String(round(lo)), count: values.length }];
  }

  const width = hi - lo;
  const bins = Array.from({ length: binCount }, (_, index) => {
    const from = round(lo + (index * width) / binCount);
    const to = round(lo + ((index + 1) * width) / binCount);
    return { from, to, label: `${from}–${to}`, count: 0 };
  });
  for (const value of values) {
    const index = Math.floor(((value - lo) * binCount) / width);
    bins[Math.min(binCount - 1, Math.max(0, index))].count++;
  }
  return bins;
}

export function trendSeries({ trends, periods, parameterId }) {
  const byPeriod = new Map();
  for (const row of trends) {
    if (row.parameterId === parameterId) {
      byPeriod.set(row.periodNumber, { average: row.average, count: row.count });
    }
  }
  if (byPeriod.size === 0) return [];

  const first = Math.min(...byPeriod.keys());
  return periods
    .filter(
      (period) =>
        period.number >= first &&
        (period.parameterIds.includes(parameterId) || byPeriod.has(period.number))
    )
    .map((period) => ({
      periodNumber: period.number,
      average: byPeriod.get(period.number)?.average ?? null,
      count: byPeriod.get(period.number)?.count ?? 0,
    }));
}

// One student's card behind their node: every in-use parameter this period with
// the score entered (or null where it's still missing) and the change from the
// previous period, plus the measured/total tally. Built from the results already
// loaded — the same "measured means the value is defined" rule summarize() and
// cohortField() use — so a click on a node needs no extra fetch. An unknown id
// (e.g. a stale selection) yields an empty-but-shaped record rather than throwing.
export function studentBreakdown(results, studentId) {
  const inUse = results.parameters.filter((parameter) => parameter.inUse);
  const student = results.students.find((s) => s.id === studentId) ?? null;
  const values = student?.values ?? {};
  const previous = student?.previous ?? {};
  const rows = inUse.map((parameter) => {
    const now = values[parameter.id];
    const before = previous[parameter.id];
    return {
      parameter,
      value: now === undefined ? null : now,
      change:
        now !== undefined && before !== undefined ? round(now - before) : null,
    };
  });
  return {
    id: studentId,
    fullName: student?.fullName ?? '',
    studentCode: student?.studentCode ?? null,
    measured: rows.filter((row) => row.value !== null).length,
    inUse: inUse.length,
    rows,
  };
}

export function unmeasuredStudents(results) {
  const inUse = results.parameters.filter((parameter) => parameter.inUse);
  if (inUse.length === 0) return [];

  return results.students
    .map((student) => ({
      id: student.id,
      fullName: student.fullName,
      studentCode: student.studentCode,
      missing: inUse
        .filter((parameter) => student.values[parameter.id] === undefined)
        .map((parameter) => parameter.name),
    }))
    .filter((item) => item.missing.length > 0)
    .sort(
      (a, b) =>
        b.missing.length - a.missing.length ||
        a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' })
    );
}