import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeAudit } from '../src/lib/audit.js';

test('describes student events', () => {
  assert.equal(
    describeAudit({
      action: 'student.create',
      details: { result: { fullName: 'Maria Lopez', studentCode: 'K7M2QX9A' } },
    }),
    'Added student Maria Lopez (K7M2-QX9A)'
  );
  assert.equal(
    describeAudit({
      action: 'student.delete',
      studentName: 'Maria Lopez',
      studentCode: 'K7M2QX9A',
      details: {},
    }),
    'Deleted student Maria Lopez (K7M2-QX9A)'
  );
  assert.equal(
    describeAudit({ action: 'student.delete', details: {} }),
    'Deleted a student'
  );
});

test('describes parameter changes', () => {
  assert.equal(
    describeAudit({
      action: 'parameter_change.create',
      changeParameterName: 'Balance',
      details: {
        result: { action: 'remove', scope: 'this_period_only', periodNumber: 7 },
      },
    }),
    'Removed Balance for this period only, Period 7'
  );
  assert.equal(
    describeAudit({
      action: 'parameter_change.create',
      changeParameterName: 'Balance',
      details: {
        result: { action: 'add', scope: 'from_here_on', periodNumber: 5 },
      },
    }),
    'Added Balance from this period on, Period 5'
  );
});

test('describes score saves with singular and plural', () => {
  assert.equal(
    describeAudit({ action: 'scores.save', details: { count: 3, periodNumber: 12 } }),
    'Saved 3 scores in Period 12'
  );
  assert.equal(
    describeAudit({ action: 'scores.save', details: { count: 1, periodNumber: 12 } }),
    'Saved 1 score in Period 12'
  );
});

test('describes sign-in events', () => {
  assert.equal(describeAudit({ action: 'auth.login', details: {} }), 'Signed in');
  assert.equal(
    describeAudit({
      action: 'auth.login_failed',
      details: { attemptedUsername: 'admin' },
    }),
    'Failed sign-in attempt for "admin"'
  );
});

test('unknown actions and generic changes still produce text', () => {
  assert.equal(describeAudit({ action: 'something.new' }), 'something.new');
  assert.equal(
    describeAudit({
      action: 'api.change',
      details: { method: 'POST', path: '/api/x' },
    }),
    'POST /api/x'
  );
});

test('describes user management events', () => {
  assert.equal(
    describeAudit({
      action: 'user.create',
      details: { username: 'teacher1', fullName: 'Tina Teacher', role: 'staff' },
    }),
    'Created staff account "teacher1" (Tina Teacher)'
  );
  assert.equal(
    describeAudit({ action: 'user.password_reset', details: { username: 'teacher1' } }),
    'Reset the password of "teacher1"'
  );
  assert.equal(
    describeAudit({
      action: 'user.update',
      details: {
        username: 'teacher1',
        changes: { role: { from: 'staff', to: 'viewer' } },
      },
    }),
    'Updated user "teacher1": role staff → viewer'
  );
});

test('describes user updates with several changes', () => {
  assert.equal(
    describeAudit({
      action: 'user.update',
      details: {
        username: 'teacher1',
        changes: {
          isActive: { from: true, to: false },
          fullName: { from: 'A', to: 'B' },
        },
      },
    }),
    'Updated user "teacher1": deactivated, renamed to B'
  );
  assert.equal(
    describeAudit({
      action: 'user.update',
      details: { username: 'teacher1', changes: { isActive: { from: false, to: true } } },
    }),
    'Updated user "teacher1": reactivated'
  );
});

test('describes locked-score overrides', () => {
  assert.equal(
    describeAudit({
      action: 'scores.save',
      details: {
        count: 1,
        periodNumber: 12,
        overrideReason: 'Typo corrected after review',
      },
    }),
    'Saved 1 score in Period 12, including locked scores changed with an override: "Typo corrected after review"'
  );
});
test('describes student imports', () => {
  assert.equal(
    describeAudit({ action: 'student.import', details: { count: 12, skipped: 0 } }),
    'Imported 12 students from a file'
  );
  assert.equal(
    describeAudit({ action: 'student.import', details: { count: 1, skipped: 3 } }),
    'Imported 1 student from a file (3 rows skipped)'
  );
});
test('describes score imports', () => {
  assert.equal(
    describeAudit({
      action: 'scores.save',
      details: { count: 24, periodNumber: 12, source: 'import' },
    }),
    'Imported 24 scores from a file into Period 12'
  );
  assert.equal(
    describeAudit({
      action: 'scores.save',
      details: { count: 1, periodNumber: 3, source: 'import' },
    }),
    'Imported 1 score from a file into Period 3'
  );
});