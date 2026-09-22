import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNames,
  guessColumns,
  looksLikeHeader,
  prepareRows,
} from '../src/lib/importNames.js';

test('empty rows are dropped but row numbers stay those of the file', () => {
  const parsed = [['Name'], [''], ['Ana'], [' ', ''], ['Ben']];
  assert.deepEqual(
    prepareRows(parsed).map((item) => item.row),
    [1, 3, 5]
  );
});

test('a header row is recognised only when a cell is a typical header word', () => {
  assert.equal(looksLikeHeader(['Full name', 'Class']), true);
  assert.equal(looksLikeHeader(['NAME']), true);
  assert.equal(looksLikeHeader(['ID', 'Surname']), true);
  assert.equal(looksLikeHeader(['Maria Lopez', '5A']), false);
  assert.equal(looksLikeHeader(['Name Smith']), false);
});

test('name columns are guessed from the header', () => {
  assert.deepEqual(guessColumns(['Class', 'Full Name']), {
    mode: 'single',
    firstColumn: 1,
    secondColumn: null,
  });
  assert.deepEqual(guessColumns(['ID', 'First name', 'Surname']), {
    mode: 'two',
    firstColumn: 1,
    secondColumn: 2,
  });
  assert.deepEqual(guessColumns(['Foo', 'Bar']), {
    mode: 'single',
    firstColumn: 0,
    secondColumn: null,
  });
});

test('names are built from one column or two, skipping the header', () => {
  const two = prepareRows([['First', 'Last'], ['Maria', 'Lopez'], ['Ana', '']]);
  assert.deepEqual(
    buildNames({ rows: two, hasHeader: true, mode: 'two', firstColumn: 0, secondColumn: 1 }),
    [
      { row: 2, fullName: 'Maria Lopez' },
      { row: 3, fullName: 'Ana' },
    ]
  );

  const one = prepareRows([['Maria Lopez', '5A'], ['Ana Souza', '5B'], ['Short']]);
  assert.deepEqual(
    buildNames({ rows: one, hasHeader: false, mode: 'single', firstColumn: 0, secondColumn: null }),
    [
      { row: 1, fullName: 'Maria Lopez' },
      { row: 2, fullName: 'Ana Souza' },
      { row: 3, fullName: 'Short' },
    ]
  );
  assert.deepEqual(
    buildNames({ rows: one, hasHeader: false, mode: 'single', firstColumn: 5, secondColumn: null }).map(
      (item) => item.fullName
    ),
    ['', '', '']
  );
});