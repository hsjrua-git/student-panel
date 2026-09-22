import { parseCell } from './cells.js';

const CODE_HEADER = /^(student[\s_-]*)?(code|id)$/i;
const NAME_HEADER = /^(full[\s_-]*name|name|student(\s*name)?)$/i;

export const MAX_SCORE_CELLS = 5000;

export function normalizeCode(text) {
  return String(text ?? '').replace(/[-\s]/g, '').toUpperCase();
}

export function nameKey(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function reasonValid(text) {
  const value = String(text ?? '').trim().replace(/\s+/g, ' ');
  return value.length >= 5 && value.length <= 300;
}

export function looksLikeScoreHeader(cells, parameters) {
  const names = new Set(parameters.map((parameter) => nameKey(parameter.name)));
  return cells.some((cell) => {
    const text = String(cell ?? '').trim();
    return (
      CODE_HEADER.test(text) || NAME_HEADER.test(text) || names.has(nameKey(text))
    );
  });
}

export function guessLayout(headerCells, parameters) {
  const texts = headerCells.map((cell) => String(cell ?? '').trim());
  const codeColumn = texts.findIndex((text) => CODE_HEADER.test(text));
  const nameColumn = texts.findIndex((text) => NAME_HEADER.test(text));

  const mapping = {};
  const taken = new Set();
  for (const parameter of parameters) {
    const wanted = nameKey(parameter.name);
    const index = texts.findIndex(
      (text, i) => !taken.has(i) && nameKey(text) === wanted
    );
    if (index !== -1) {
      mapping[parameter.id] = index;
      taken.add(index);
    }
  }

  return {
    codeColumn: codeColumn === -1 ? null : codeColumn,
    nameColumn: nameColumn === -1 ? null : nameColumn,
    mapping,
  };
}

export function buildImport({
  rows,
  hasHeader,
  codeColumn,
  nameColumn,
  mapping,
  parameters,
  studentsByCode,
}) {
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const mapped = parameters.filter((parameter) =>
    Number.isInteger(mapping[parameter.id])
  );

  const seenCodes = new Map();
  const entries = [];
  const refs = [];
  const viewRows = [];
  let localProblemCount = 0;
  let blankCells = 0;

  for (const { row, cells } of dataRows) {
    const rawCode = String(cells[codeColumn] ?? '').trim();
    const code = normalizeCode(rawCode);
    const student = code ? (studentsByCode.get(code) ?? null) : null;

    let rowProblem = null;
    if (!code) {
      rowProblem = 'No student code in this row.';
    } else if (!student) {
      rowProblem = `No student with code "${rawCode}".`;
    } else if (seenCodes.has(code)) {
      rowProblem = `Same student as row ${seenCodes.get(code)}.`;
    } else {
      seenCodes.set(code, row);
      if (nameColumn !== null) {
        const fileName = String(cells[nameColumn] ?? '').trim();
        if (fileName !== '' && nameKey(fileName) !== nameKey(student.fullName)) {
          rowProblem = `The name in the file ("${fileName}") does not match ${student.fullName}.`;
        }
      }
    }
    if (rowProblem) localProblemCount++;

    const viewCells = [];
    for (const parameter of mapped) {
      const text = String(cells[mapping[parameter.id]] ?? '').trim();
      const cell = {
        parameterId: parameter.id,
        text,
        blank: false,
        problem: null,
        entryIndex: null,
      };

      if (text === '') {
        cell.blank = true;
        blankCells++;
      } else if (!rowProblem) {
        const parsed = parseCell(text, parameter);
        if (parsed.error) {
          cell.problem = parsed.error;
          localProblemCount++;
        } else {
          cell.entryIndex = entries.length;
          entries.push({
            studentId: student.id,
            parameterId: parameter.id,
            value: parsed.value,
          });
          refs.push({ row, parameterId: parameter.id });
        }
      }
      viewCells.push(cell);
    }

    viewRows.push({ row, rawCode, student, rowProblem, cells: viewCells });
  }

  return {
    rows: viewRows,
    entries,
    refs,
    localProblemCount,
    blankCells,
    mappedParameters: mapped,
  };
}

export function planImport({ built, server, canOverride }) {
  const problemIndexes = new Set(server.problems.map((problem) => problem.index));
  const statusByIndex = new Map(
    server.cells.map((cell) => [cell.index, cell.status])
  );

  const send = [];
  let unchanged = 0;
  let lockedOverride = 0;
  let lockedBlocked = 0;

  built.entries.forEach((entry, index) => {
    if (problemIndexes.has(index)) return;
    const status = statusByIndex.get(index);
    if (status === undefined) return;

    if (status === 'unchanged') {
      unchanged++;
      return;
    }
    if (status === 'locked') {
      if (!canOverride) {
        lockedBlocked++;
        return;
      }
      lockedOverride++;
    }
    send.push(entry);
  });

  return {
    send,
    unchanged,
    lockedOverride,
    lockedBlocked,
    problemCount: built.localProblemCount + problemIndexes.size + lockedBlocked,
  };
}