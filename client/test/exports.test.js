import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createdStudentsCsvRows,
  historyCsvRows,
  resultsCsvRows,
  studentsCsvRows,
} from '../src/lib/exports.js';

test('the students export has a header and one row per student', () => {
  assert.deepEqual(
    studentsCsvRows([
      {
        studentCode: 'K7M2QX9A',
        fullName: 'Maria Lopez',
        createdAt: '2026-09-20T12:39:49.460Z',
      },
    ]),
    [
      ['Student code', 'Full name', 'Added (UTC date)'],
      ['K7M2QX9A', 'Maria Lopez', '2026-09-20'],
    ]
  );
  assert.deepEqual(studentsCsvRows([]), [
    ['Student code', 'Full name', 'Added (UTC date)'],
  ]);
});

test('the list of created students includes their codes', () => {
  assert.deepEqual(
    createdStudentsCsvRows([
      { row: 2, studentCode: 'P4T9WB2E', fullName: 'Ana Souza' },
    ]),
    [
      ['Row', 'Student code', 'Full name'],
      [2, 'P4T9WB2E', 'Ana Souza'],
    ]
  );
});

test('the results export leaves missing scores empty and can add change columns', () => {
  const columns = [
    { id: 'speed', name: 'Speed' },
    { id: 'balance', name: 'Balance' },
  ];
  const rows = [
    {
      studentCode: 'AAAAAAAA',
      fullName: 'Ana',
      values: { speed: 7, balance: 0 },
      previous: { speed: 6 },
    },
    { studentCode: 'BBBBBBBB', fullName: 'Ben', values: {}, previous: {} },
  ];

  assert.deepEqual(
    resultsCsvRows({ periodNumber: 5, columns, rows, showChange: false }),
    [
      ['Period', 'Student code', 'Full name', 'Speed', 'Balance'],
      [5, 'AAAAAAAA', 'Ana', 7, 0],
      [5, 'BBBBBBBB', 'Ben', null, null],
    ]
  );
  assert.deepEqual(
    resultsCsvRows({ periodNumber: 5, columns, rows, showChange: true }),
    [
      [
        'Period',
        'Student code',
        'Full name',
        'Speed',
        'Speed (change vs previous period)',
        'Balance',
        'Balance (change vs previous period)',
      ],
      [5, 'AAAAAAAA', 'Ana', 7, 1, 0, null],
      [5, 'BBBBBBBB', 'Ben', null, null, null, null],
    ]
  );
  assert.equal(
    resultsCsvRows({ periodNumber: 1, columns, rows, showChange: true })[0].length,
    5
  );
});

test('the history export follows the on-screen rules and leaves unused cells empty', () => {
  const parameters = [
    { id: 'speed', name: 'Speed' },
    { id: 'balance', name: 'Balance' },
  ];
  const periods = [
    { number: 1, startDate: '2026-09-19', endDate: '2026-09-25', parameterIds: ['speed'] },
    { number: 2, startDate: '2026-09-26', endDate: '2026-10-02', parameterIds: ['speed'] },
    {
      number: 3,
      startDate: '2026-10-03',
      endDate: '2026-10-09',
      parameterIds: ['speed', 'balance'],
    },
  ];
  const evaluations = [
    { periodNumber: 2, parameterId: 'speed', value: 7 },
    { periodNumber: 3, parameterId: 'speed', value: 8 },
    { periodNumber: 3, parameterId: 'balance', value: 4 },
  ];

  assert.deepEqual(historyCsvRows({ evaluations, periods, parameters }), [
    ['Period', 'Start date', 'End date', 'Speed', 'Balance'],
    [2, '2026-09-26', '2026-10-02', 7, null],
    [3, '2026-10-03', '2026-10-09', 8, 4],
  ]);
});