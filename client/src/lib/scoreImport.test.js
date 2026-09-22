import { describe, it, expect } from 'vitest';
import {
  buildImport,
  guessLayout,
  looksLikeScoreHeader,
  nameKey,
  normalizeCode,
  planImport,
  reasonValid,
} from './scoreImport.js';

const parameters = [
  { id: 'p1', name: 'Speed', minValue: 0, maxValue: 10 },
  { id: 'p2', name: 'Strength', minValue: 0, maxValue: 10 },
];

describe('small helpers', () => {
  it('normalizeCode strips spaces/dashes and upper-cases', () => {
    expect(normalizeCode(' s-1 2 ')).toBe('S12');
  });

  it('nameKey collapses whitespace, lower-cases, normalizes', () => {
    expect(nameKey('  Ada   LOVELACE ')).toBe('ada lovelace');
  });

  it('reasonValid needs 5–300 trimmed characters', () => {
    expect(reasonValid('    ')).toBe(false);
    expect(reasonValid('okay')).toBe(false); // 4 chars
    expect(reasonValid('fixed it')).toBe(true);
    expect(reasonValid('x'.repeat(301))).toBe(false);
  });
});

describe('header detection and layout guessing', () => {
  it('recognises a header row by code, name, or a parameter name', () => {
    expect(looksLikeScoreHeader(['Code', 'Speed'], parameters)).toBe(true);
    expect(looksLikeScoreHeader(['random', 'stuff'], parameters)).toBe(false);
  });

  it('maps columns to code, name and each parameter by header text', () => {
    const layout = guessLayout(['Code', 'Name', 'Speed', 'Strength'], parameters);
    expect(layout).toEqual({
      codeColumn: 0,
      nameColumn: 1,
      mapping: { p1: 2, p2: 3 },
    });
  });

  it('reports missing code/name columns as null', () => {
    const layout = guessLayout(['Speed'], parameters);
    expect(layout.codeColumn).toBe(null);
    expect(layout.nameColumn).toBe(null);
    expect(layout.mapping).toEqual({ p1: 0 });
  });
});

describe('buildImport', () => {
  const studentsByCode = new Map([
    ['S1', { id: 'a', fullName: 'Ada Lovelace', studentCode: 'S1' }],
    ['S2', { id: 'b', fullName: 'Bea Ray', studentCode: 'S2' }],
  ]);

  function run(dataCells) {
    return buildImport({
      rows: [
        { row: 1, cells: ['Code', 'Name', 'Speed'] },
        ...dataCells.map((cells, i) => ({ row: i + 2, cells })),
      ],
      hasHeader: true,
      codeColumn: 0,
      nameColumn: 1,
      mapping: { p1: 2 },
      parameters,
      studentsByCode,
    });
  }

  it('turns valid rows into entries with student and parameter ids', () => {
    const built = run([['S1', 'Ada Lovelace', '8']]);
    expect(built.entries).toEqual([{ studentId: 'a', parameterId: 'p1', value: 8 }]);
    expect(built.localProblemCount).toBe(0);
  });

  it('flags an unknown code and a name that does not match', () => {
    const built = run([
      ['S9', '', '5'], // no such code
      ['S2', 'Wrong Name', '5'], // name mismatch
    ]);
    const problems = built.rows.map((r) => r.rowProblem);
    expect(problems[0]).toMatch(/No student with code/);
    expect(problems[1]).toMatch(/does not match/);
    expect(built.localProblemCount).toBe(2);
    expect(built.entries).toEqual([]); // neither row produced an entry
  });

  it('flags a duplicate student and an out-of-range score', () => {
    const dup = run([
      ['S1', 'Ada Lovelace', '8'],
      ['S1', 'Ada Lovelace', '9'],
    ]);
    expect(dup.rows[1].rowProblem).toMatch(/Same student as row/);

    const bad = run([['S1', 'Ada Lovelace', '99']]);
    expect(bad.rows[0].cells[0].problem).toMatch(/at most/i);
    expect(bad.localProblemCount).toBe(1);
    expect(bad.blankCells).toBe(0);
  });

  it('counts blank cells and leaves them out of entries', () => {
    const built = run([['S1', 'Ada Lovelace', '']]);
    expect(built.blankCells).toBe(1);
    expect(built.entries).toEqual([]);
  });
});

describe('planImport', () => {
  const built = {
    entries: [
      { studentId: 'a', parameterId: 'p1', value: 8 },
      { studentId: 'b', parameterId: 'p1', value: 5 },
      { studentId: 'c', parameterId: 'p1', value: 7 },
    ],
    localProblemCount: 0,
  };
  const server = {
    problems: [],
    cells: [
      { index: 0, status: 'new' },
      { index: 1, status: 'unchanged' },
      { index: 2, status: 'locked' },
    ],
  };

  it('sends new/changed rows, skips unchanged, and needs override for locked', () => {
    const plan = planImport({ built, server, canOverride: true });
    expect(plan.send.map((e) => e.studentId).sort()).toEqual(['a', 'c']);
    expect(plan.unchanged).toBe(1);
    expect(plan.lockedOverride).toBe(1);
    expect(plan.lockedBlocked).toBe(0);
  });

  it('blocks locked rows when the user cannot override', () => {
    const plan = planImport({ built, server, canOverride: false });
    expect(plan.send.map((e) => e.studentId)).toEqual(['a']); // c is locked+blocked
    expect(plan.lockedBlocked).toBe(1);
    expect(plan.problemCount).toBe(1);
  });

  it('treats a redacted "save" status (blind entry) as a plain write', () => {
    const redacted = {
      problems: [],
      cells: [
        { index: 0, status: 'save' },
        { index: 1, status: 'save' },
        { index: 2, status: 'locked' },
      ],
    };
    const plan = planImport({ built, server: redacted, canOverride: true });
    expect(plan.send).toHaveLength(3); // both saves + the overridable locked
    expect(plan.unchanged).toBe(0);
  });
});
