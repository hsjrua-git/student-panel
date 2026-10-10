import './_env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalisePath,
  classifyRequest,
  safeBody,
  entityIdFromPath,
} from '../src/lib/auditRules.js';

const UUID = '11111111-1111-1111-1111-111111111111';

test('normalisePath strips query + trailing slash and lowercases', () => {
  assert.equal(normalisePath('/api/Students/?foo=bar'), '/api/students');
  assert.equal(normalisePath('/API/Students/'), '/api/students');
});

test('classifyRequest handles login success and failure specially', () => {
  assert.deepEqual(classifyRequest('POST', '/api/auth/login', 200), { action: 'auth.login', entityType: 'auth' });
  assert.deepEqual(classifyRequest('POST', '/api/auth/login', 401), { action: 'auth.login_failed', entityType: 'auth' });
  assert.equal(classifyRequest('POST', '/api/auth/login', 500), null);
});

test('classifyRequest maps known mutations and ignores non-2xx', () => {
  assert.deepEqual(classifyRequest('POST', '/api/students', 201), { action: 'student.create', entityType: 'student' });
  assert.deepEqual(classifyRequest('DELETE', `/api/parameters/${UUID}`, 200), { action: 'parameter.delete', entityType: 'parameter' });
  assert.deepEqual(classifyRequest('PUT', '/api/settings', 200), { action: 'settings.update', entityType: 'setting' });
  assert.equal(classifyRequest('POST', '/api/students', 400), null);
});

test('classifyRequest skips self-audited routes and falls back generically', () => {
  assert.equal(classifyRequest('POST', '/api/evaluations/bulk', 200), null);
  assert.equal(classifyRequest('PUT', '/api/preferences', 200), null);
  assert.deepEqual(classifyRequest('POST', '/api/something', 200), { action: 'api.change', entityType: null });
});

test('safeBody redacts secret-like keys and truncates large payloads', () => {
  assert.equal(safeBody(null), null);
  assert.equal(safeBody('str'), null);
  assert.deepEqual(safeBody({ password: 'x', ok: 1, nested: { token: 't', keep: 2 } }), {
    password: '[hidden]',
    ok: 1,
    nested: { token: '[hidden]', keep: 2 },
  });
  assert.deepEqual(safeBody({ big: 'x'.repeat(2001) }), { truncated: true });
});

test('entityIdFromPath returns a trailing UUID or null', () => {
  assert.equal(entityIdFromPath(`/api/students/${UUID}`), UUID);
  assert.equal(entityIdFromPath('/api/students'), null);
});
