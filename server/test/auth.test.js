import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, hasAtLeast, isRole, minRoleFor } from '../src/lib/roles.js';
import {
  generatePassword,
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from '../src/lib/passwords.js';
import { parseUsername } from '../src/validation/user.js';

test('roles are ordered viewer < staff < admin', () => {
  assert.deepEqual(ROLES, ['viewer', 'staff', 'admin']);
  assert.equal(hasAtLeast('admin', 'staff'), true);
  assert.equal(hasAtLeast('staff', 'staff'), true);
  assert.equal(hasAtLeast('viewer', 'staff'), false);
  assert.equal(hasAtLeast('staff', 'admin'), false);
  assert.equal(hasAtLeast('viewer', 'viewer'), true);
});

test('unknown roles are never allowed', () => {
  assert.equal(hasAtLeast('hacker', 'viewer'), false);
  assert.equal(hasAtLeast(undefined, 'viewer'), false);
  assert.equal(hasAtLeast('admin', 'nonsense'), false);
  assert.equal(isRole('admin'), true);
  assert.equal(isRole('toString'), false);
  assert.equal(isRole(5), false);
});

test('a policy maps methods to minimum roles and denies the rest', () => {
  const policy = { GET: 'viewer', POST: 'staff' };
  assert.equal(minRoleFor(policy, 'GET'), 'viewer');
  assert.equal(minRoleFor(policy, 'HEAD'), 'viewer');
  assert.equal(minRoleFor(policy, 'POST'), 'staff');
  assert.equal(minRoleFor(policy, 'DELETE'), null);
  assert.equal(minRoleFor(policy, 'OPTIONS'), null);
  assert.equal(minRoleFor(policy, 'toString'), null);
});

test('passwords are hashed and verified', async () => {
  const hash = await hashPassword('correct-horse-battery');
  assert.notEqual(hash, 'correct-horse-battery');
  assert.ok(hash.startsWith('$argon2'));
  assert.equal(await verifyPassword(hash, 'correct-horse-battery'), true);
  assert.equal(await verifyPassword(hash, 'wrong-horse-battery'), false);
  assert.equal(await verifyPassword('not a real hash', 'anything'), false);
});

test('new passwords are checked', () => {
  assert.equal(validateNewPassword('long-enough-password'), null);
  assert.ok(validateNewPassword('short'));
  assert.ok(validateNewPassword(undefined));
  assert.ok(validateNewPassword('x'.repeat(129)));
  assert.ok(validateNewPassword('Ada.Lovelace', { username: 'ada.lovelace' }));
});

test('generated passwords use the safe alphabet and differ each time', () => {
  const a = generatePassword();
  const b = generatePassword();
  assert.equal(a.length, 16);
  assert.match(a, /^[2-9A-HJ-NP-Za-km-np-z]+$/);
  assert.notEqual(a, b);
  assert.equal(generatePassword(24).length, 24);
});

test('usernames are normalised and validated', () => {
  assert.deepEqual(parseUsername('  Ada.Lovelace '), { value: 'ada.lovelace' });
  assert.ok(parseUsername('ab').error);
  assert.ok(parseUsername('has space').error);
  assert.ok(parseUsername('x'.repeat(33)).error);
  assert.ok(parseUsername(undefined).error);
});