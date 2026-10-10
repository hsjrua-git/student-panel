import './_env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { isUuid } from '../src/lib/ids.js';
import { generateStudentCode } from '../src/lib/studentCode.js';

test('isUuid accepts canonical UUIDs and rejects anything else', () => {
  assert.equal(isUuid('11111111-1111-1111-1111-111111111111'), true);
  assert.equal(isUuid('11111111-1111-1111-1111-11111111111'), false); // too short
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid(123), false);
  assert.equal(isUuid(null), false);
});

test('generateStudentCode is 8 chars from the unambiguous alphabet', () => {
  for (let i = 0; i < 50; i++) {
    const code = generateStudentCode();
    assert.match(code, /^[2-9A-HJ-NP-Z]{8}$/);
  }
});
