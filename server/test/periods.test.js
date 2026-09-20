import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSaturday,
  isValidIsoDate,
  periodDates,
  periodForDate,
  todayIso,
} from '../src/lib/periods.js';

const ANCHOR = '2026-09-19'; // a Saturday

test('recognises valid dates and Saturdays', () => {
  assert.equal(isValidIsoDate('2026-09-19'), true);
  assert.equal(isValidIsoDate('2026-02-31'), false);
  assert.equal(isValidIsoDate('2026-9-19'), false);
  assert.equal(isSaturday('2026-09-19'), true);
  assert.equal(isSaturday('2026-09-20'), false);
});

test('period 1 runs from the anchor Saturday to the following Friday', () => {
  assert.equal(periodForDate(ANCHOR, '2026-09-19'), 1);
  assert.equal(periodForDate(ANCHOR, '2026-09-25'), 1);
});

test('the next Saturday starts period 2', () => {
  assert.equal(periodForDate(ANCHOR, '2026-09-26'), 2);
});

test('dates before the anchor belong to no period', () => {
  assert.equal(periodForDate(ANCHOR, '2026-09-18'), null);
});

test('later dates, including across a daylight-saving change', () => {
  assert.equal(periodForDate(ANCHOR, '2026-10-30'), 6);
  assert.equal(periodForDate(ANCHOR, '2026-10-31'), 7);
  assert.equal(periodForDate(ANCHOR, '2026-12-31'), 15);
});

test('period dates', () => {
  assert.deepEqual(periodDates(ANCHOR, 1), {
    number: 1,
    startDate: '2026-09-19',
    endDate: '2026-09-25',
  });
  assert.deepEqual(periodDates(ANCHOR, 2), {
    number: 2,
    startDate: '2026-09-26',
    endDate: '2026-10-02',
  });
  assert.deepEqual(periodDates(ANCHOR, 15), {
    number: 15,
    startDate: '2026-12-26',
    endDate: '2027-01-01',
  });
});

test('period numbers must be whole numbers from 1', () => {
  assert.throws(() => periodDates(ANCHOR, 0));
  assert.throws(() => periodDates(ANCHOR, 1.5));
});

test("today's date uses the computer's local calendar day", () => {
  assert.equal(todayIso(new Date(2026, 8, 20, 23, 59)), '2026-09-20');
  assert.equal(todayIso(new Date(2026, 8, 20, 0, 1)), '2026-09-20');
});

test('the period changes at local midnight between Friday and Saturday', () => {
  assert.equal(periodForDate(ANCHOR, todayIso(new Date(2026, 8, 25, 23, 59))), 1);
  assert.equal(periodForDate(ANCHOR, todayIso(new Date(2026, 8, 26, 0, 1))), 2);
});