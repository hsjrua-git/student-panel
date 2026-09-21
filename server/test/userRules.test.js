import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkUserChange } from '../src/lib/userRules.js';
import {
  parseNewUser,
  parseUserUpdate,
} from '../src/validation/user.js';

const admin = { id: 'a1', role: 'admin', isActive: true };
const staff = { id: 's1', role: 'staff', isActive: true };

test('you cannot demote or deactivate yourself', () => {
  assert.ok(
    checkUserChange({ actorId: 'a1', target: admin, changes: { role: 'staff' }, activeAdminCount: 3 })
  );
  assert.ok(
    checkUserChange({ actorId: 'a1', target: admin, changes: { isActive: false }, activeAdminCount: 3 })
  );
});

test('you can still change your own name', () => {
  assert.equal(
    checkUserChange({ actorId: 'a1', target: admin, changes: { fullName: 'New Name' }, activeAdminCount: 1 }),
    null
  );
});

test('the last active administrator cannot be removed', () => {
  const message = 'There must always be at least one active administrator.';
  assert.equal(
    checkUserChange({ actorId: 'a2', target: admin, changes: { isActive: false }, activeAdminCount: 1 }),
    message
  );
  assert.equal(
    checkUserChange({ actorId: 'a2', target: admin, changes: { role: 'viewer' }, activeAdminCount: 1 }),
    message
  );
});

test('other changes are allowed', () => {
  assert.equal(
    checkUserChange({ actorId: 'a2', target: admin, changes: { isActive: false }, activeAdminCount: 2 }),
    null
  );
  assert.equal(
    checkUserChange({ actorId: 'a1', target: staff, changes: { role: 'admin' }, activeAdminCount: 1 }),
    null
  );
  assert.equal(
    checkUserChange({ actorId: 'a1', target: staff, changes: { isActive: false }, activeAdminCount: 1 }),
    null
  );
  const inactiveAdmin = { id: 'a3', role: 'admin', isActive: false };
  assert.equal(
    checkUserChange({ actorId: 'a1', target: inactiveAdmin, changes: { role: 'viewer' }, activeAdminCount: 1 }),
    null
  );
  const inactiveStaff = { id: 's2', role: 'staff', isActive: false };
  assert.equal(
    checkUserChange({ actorId: 'a1', target: inactiveStaff, changes: { isActive: true }, activeAdminCount: 1 }),
    null
  );
});

test('new users are validated and normalised', () => {
  assert.deepEqual(
    parseNewUser({ username: ' Tina.T ', fullName: '  Tina   Teacher ', role: 'staff' }),
    { values: { username: 'tina.t', fullName: 'Tina Teacher', role: 'staff' } }
  );
});

test('new users with bad details are refused', () => {
  assert.ok(parseNewUser({ username: 'ab', fullName: 'X', role: 'staff' }).error);
  assert.ok(parseNewUser({ username: 'okname', fullName: '   ', role: 'staff' }).error);
  assert.ok(parseNewUser({ username: 'okname', fullName: 'X', role: 'boss' }).error);
  assert.ok(parseNewUser(undefined).error);
});

test('updates accept only known fields', () => {
  assert.deepEqual(parseUserUpdate({ role: 'viewer' }), { values: { role: 'viewer' } });
  assert.deepEqual(
    parseUserUpdate({ isActive: false, fullName: ' New  Name ' }),
    { values: { fullName: 'New Name', isActive: false } }
  );
  assert.ok(parseUserUpdate({}).error);
  assert.ok(parseUserUpdate({ username: 'x' }).error);
  assert.ok(parseUserUpdate({ isActive: 'no' }).error);
  assert.ok(parseUserUpdate({ role: 'boss' }).error);
  assert.ok(parseUserUpdate(null).error);
});