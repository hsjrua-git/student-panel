import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvField, toCsv } from '../src/lib/csv.js';

test('rows become lines with a byte-order mark and Windows line endings', () => {
  assert.equal(toCsv([['a', 'b'], [1, 2.5]]), '\uFEFFa,b\r\n1,2.5\r\n');
});

test('fields with delimiters, quotes or line breaks are quoted', () => {
  assert.equal(csvField('plain'), 'plain');
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField('two\nlines'), '"two\nlines"');
  assert.equal(csvField('Zoë Müller'), 'Zoë Müller');
});

test('the semicolon separator quotes semicolons, not commas', () => {
  assert.equal(csvField('a,b', ';'), 'a,b');
  assert.equal(csvField('a;b', ';'), '"a;b"');
  assert.equal(
    toCsv([['x', 'y;z', 1.5]], { delimiter: ';' }),
    '\uFEFFx;"y;z";1.5\r\n'
  );
});

test('text that a spreadsheet could run as a formula is defused, numbers are not', () => {
  assert.equal(csvField('=1+1'), "'=1+1");
  assert.equal(csvField('+cmd'), "'+cmd");
  assert.equal(csvField('-text'), "'-text");
  assert.equal(csvField('@x'), "'@x");
  assert.equal(csvField('\tTab'), "'\tTab");
  assert.equal(csvField(-5), '-5');
  assert.equal(csvField('safe = fine'), 'safe = fine');
});

test('empty and invalid numbers become empty cells', () => {
  assert.equal(csvField(null), '');
  assert.equal(csvField(undefined), '');
  assert.equal(csvField(Number.NaN), '');
  assert.equal(csvField(Infinity), '');
  assert.equal(csvField(0), '0');
});