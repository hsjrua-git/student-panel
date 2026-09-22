export const MAX_RESULT_STUDENTS = 5000;

export function buildResults({
  periodNumber,
  parameters,
  usedIds,
  students,
  evaluations,
}) {
  const activeIds = new Set(students.map((student) => student.id));
  const current = new Map();
  const previous = new Map();
  const scoredHere = new Set();

  for (const item of evaluations) {
    if (!activeIds.has(item.studentId)) continue;
    const key = `${item.studentId}:${item.parameterId}`;
    if (item.periodNumber === periodNumber) {
      current.set(key, item.value);
      scoredHere.add(item.parameterId);
    } else if (item.periodNumber === periodNumber - 1) {
      previous.set(key, item.value);
    }
  }

  const shown = parameters
    .filter(
      (parameter) =>
        usedIds.has(parameter.id) || scoredHere.has(parameter.id)
    )
    .map((parameter) => ({ ...parameter, inUse: usedIds.has(parameter.id) }));

  const rows = students.map((student) => {
    const values = {};
    const before = {};
    for (const parameter of shown) {
      const key = `${student.id}:${parameter.id}`;
      if (current.has(key)) values[parameter.id] = current.get(key);
      if (previous.has(key)) before[parameter.id] = previous.get(key);
    }
    return {
      id: student.id,
      fullName: student.fullName,
      studentCode: student.studentCode,
      values,
      previous: before,
    };
  });

  return { parameters: shown, students: rows };
}