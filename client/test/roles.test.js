import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasAtLeast } from '../src/auth/roles.js';

test('roles are ordered and unknown roles never pass', () => {
  assert.equal(hasAtLeast('admin', 'staff'), true);
  assert.equal(hasAtLeast('staff', 'staff'), true);
  assert.equal(hasAtLeast('viewer', 'staff'), false);
  assert.equal(hasAtLeast('viewer', 'viewer'), true);
  assert.equal(hasAtLeast('hacker', 'viewer'), false);
  assert.equal(hasAtLeast(undefined, 'viewer'), false);
  assert.equal(hasAtLeast('admin', 'nonsense'), false);
  assert.equal(hasAtLeast('toString', 'viewer'), false);
});