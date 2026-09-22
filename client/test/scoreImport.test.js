import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreTemplateCsvRows } from '../src/lib/exports.js';
import { prepareRows } from '../src/lib/importNames.js';
import {
  buildImport,
  guessLayout,
  looksLikeScoreHeader,
  nameKey,
  normalizeCode,
  planImport,
  reasonValid,
} from '../src/lib/scoreImport.js';

const parameters = [
  { id: 'speed', name: 'Speed', minValue: 0, maxValue: 10 },
  { id: 'balance', name: 'Balance', minValue: null, maxValue: null },
];

const studentsByCode = new Map([
  ['K7M2QX9A', { id: 's1', fullName: 'Ana Souza', studentCode: 'K7M2QX9A' }],
  ['P4T9WB2E', { id: 's2', fullName: 'Ben Ortiz', studentCode: 'P4T9WB2E' }],
  ['H2J3K4L5', { id: 's3', fullName: 'Cleo Vance', studentCode: 'H2J3K4L5' }],
  ['M5N6R7S8', { id: 's4', fullName: 'Dan Wu', studentCode: 'M5N6R7S8' }],
]);

const mapping = { speed: 2, balance: 3 };
const layout = { codeColumn: 0, nameColumn: 1, mapping, parameters, studentsByCode };

test('codes and names are normalised for comparison', () => {
  assert.equal(normalizeCode(' k7m2-qx9a '), 'K7M2QX9A');
  assert.equal(normalizeCode(null), '');
  assert.equal(nameKey('  María   LÓPEZ '), nameKey('maría lópez'));
  assert.equal(nameKey('Zoe\u0308'), nameKey('Zoë'));
  assert.equal(reasonValid('  Typo fixed '), true);
  assert.equal(reasonValid('abc'), false);
  assert.equal(reasonValid('x'.repeat(301)), false);
});

test('a header row is recognised by code, name or parameter headings', () => {
  assert.equal(looksLikeScoreHeader(['Student code', 'Speed'], parameters), true);
  assert.equal(looksLikeScoreHeader(['Speed', 'Balance'], parameters), true);
  assert.equal(looksLikeScoreHeader(['ID', 'x'], parameters), true);
  assert.equal(looksLikeScoreHeader(['K7M2QX9A', '7'], parameters), false);
  assert.equal(looksLikeScoreHeader(['Ana Souza', '7'], parameters), false);
});

test('columns are guessed from the header', () => {
  assert.deepEqual(
    guessLayout(['Student code', 'Full name', ' speed ', 'BALANCE', 'Notes'], parameters),
    { codeColumn: 0, nameColumn: 1, mapping: { speed: 2, balance: 3 } }
  );
  assert.deepEqual(
    guessLayout(['Speed', 'Speed'], parameters).mapping,
    { speed: 0 }
  );
});

test('nothing is guessed when the header does not help', () => {
  assert.deepEqual(guessLayout(['A', 'B'], parameters), {
    codeColumn: null,
    nameColumn: null,
    mapping: {},
  });
});

const rows = prepareRows([
  ['Code', 'Name', 'Speed', 'Balance'],
  ['k7m2-qx9a', 'ana souza', '7', '4,5'],
  ['P4T9WB2E', 'Ben Ortiz', '', '3'],
  ['ZZZZZZZZ', 'Nobody', '5', '5'],
  ['', 'No Code', '5', '5'],
  ['K7M2QX9A', 'Ana Souza', '8', '8'],
  ['H2J3K4L5', 'Dan Wu', '5', '5'],
  ['M5N6R7S8', 'Dan Wu', '11', 'abc'],
]);

test('rows become scores, and every problem is reported with its row', () => {
  const built = buildImport({ rows, hasHeader: true, ...layout });

  assert.deepEqual(built.entries, [
    { studentId: 's1', parameterId: 'speed', value: 7 },
    { studentId: 's1', parameterId: 'balance', value: 4.5 },
    { studentId: 's2', parameterId: 'balance', value: 3 },
  ]);
  assert.deepEqual(built.refs, [
    { row: 2, parameterId: 'speed' },
    { row: 2, parameterId: 'balance' },
    { row: 3, parameterId: 'balance' },
  ]);
  assert.deepEqual(
    built.rows.map((item) => item.row),
    [2, 3, 4, 5, 6, 7, 8]
  );
  assert.deepEqual(
    built.rows.map((item) => item.rowProblem),
    [
      null,
      null,
      'No student with code "ZZZZZZZZ".',
      'No student code in this row.',
      'Same student as row 2.',
      'The name in the file ("Dan Wu") does not match Cleo Vance.',
      null,
    ]
  );
  assert.deepEqual(
    built.rows[6].cells.map((cell) => cell.problem),
    ['At most 10.', 'Enter a number.']
  );
  assert.equal(built.localProblemCount, 6);
  assert.equal(built.mappedParameters.length, 2);
});

test('without a header the first row is data, and a name column is optional', () => {
  const built = buildImport({
    rows,
    hasHeader: false,
    ...layout,
    nameColumn: null,
  });
  assert.equal(built.rows.length, 8);
  assert.equal(built.rows[0].rowProblem, 'No student with code "Code".');
  assert.equal(built.rows[6].rowProblem, null);
});

test('empty cells are ignored, never turned into clears', () => {
  const only = prepareRows([['P4T9WB2E', 'Ben Ortiz', '', '  ']]);
  const built = buildImport({ rows: only, hasHeader: false, ...layout });
  assert.deepEqual(built.entries, []);
  assert.equal(built.blankCells, 2);
  assert.equal(built.localProblemCount, 0);
});

const e = (studentId) => ({ studentId, parameterId: 'speed', value: 5 });
const built = { entries: [e('a'), e('b'), e('c'), e('d')], localProblemCount: 1 };
const cell = (index, status) => ({ index, status });
const server = {
  cells: [cell(0, 'new'), cell(1, 'unchanged'), cell(2, 'locked'), cell(3, 'change')],
  problems: [],
};

test('an administrator can include locked cells with a reason', () => {
  const plan = planImport({ built, server, canOverride: true });
  assert.deepEqual(
    plan.send.map((entry) => entry.studentId),
    ['a', 'c', 'd']
  );
  assert.deepEqual(
    [plan.unchanged, plan.lockedOverride, plan.lockedBlocked, plan.problemCount],
    [1, 1, 0, 1]
  );
});

test('staff cannot change locked cells, and server problems are excluded', () => {
  const staff = planImport({ built, server, canOverride: false });
  assert.deepEqual(
    staff.send.map((entry) => entry.studentId),
    ['a', 'd']
  );
  assert.deepEqual([staff.lockedBlocked, staff.problemCount], [1, 2]);

  const withProblem = planImport({
    built,
    server: { ...server, problems: [{ index: 3, message: 'x' }] },
    canOverride: true,
  });
  assert.deepEqual(
    withProblem.send.map((entry) => entry.studentId),
    ['a', 'c']
  );
  assert.equal(withProblem.problemCount, 2);
});

test('the score template lists every student with empty score columns', () => {
  assert.deepEqual(
    scoreTemplateCsvRows({
      students: [{ studentCode: 'K7M2QX9A', fullName: 'Ana Souza' }],
      parameters,
    }),
    [
      ['Student code', 'Full name', 'Speed', 'Balance'],
      ['K7M2QX9A', 'Ana Souza', null, null],
    ]
  );
});