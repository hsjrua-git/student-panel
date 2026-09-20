import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyRequest,
  entityIdFromPath,
  normalisePath,
  safeBody,
} from '../src/lib/auditRules.js';

test('paths are normalised before matching', () => {
  assert.equal(normalisePath('/API/Students/?page=2'), '/api/students');
  assert.equal(normalisePath('/api/students'), '/api/students');
});

test('known changes get friendly action names', () => {
  assert.deepEqual(classifyRequest('POST', '/api/students', 201), {
    action: 'student.create',
    entityType: 'student',
  });
  assert.deepEqual(classifyRequest('DELETE', '/api/students/abc', 204), {
    action: 'student.delete',
    entityType: 'student',
  });
  assert.deepEqual(classifyRequest('PUT', '/api/settings/period-anchor', 200), {
    action: 'settings.period_anchor',
    entityType: 'setting',
  });
  assert.deepEqual(classifyRequest('POST', '/api/auth/logout', 204), {
    action: 'auth.logout',
    entityType: 'user',
  });
  assert.deepEqual(classifyRequest('POST', '/api/auth/change-password', 200), {
    action: 'auth.password_change',
    entityType: 'user',
  });
});

test('sign-in outcomes are recorded, other failures are not', () => {
  assert.equal(classifyRequest('POST', '/api/auth/login', 200).action, 'auth.login');
  assert.equal(
    classifyRequest('POST', '/api/auth/login', 401).action,
    'auth.login_failed'
  );
  assert.equal(classifyRequest('POST', '/api/auth/login', 429), null);
  assert.equal(classifyRequest('POST', '/api/students', 400), null);
  assert.equal(classifyRequest('PATCH', '/api/students/abc', 403), null);
});

test('unknown changes are still recorded; self-logged ones are skipped', () => {
  assert.deepEqual(classifyRequest('POST', '/api/something-new', 200), {
    action: 'api.change',
    entityType: null,
  });
  assert.equal(classifyRequest('PUT', '/api/evaluations/bulk', 200), null);
  assert.equal(classifyRequest('POST', '/api/users', 201), null);
  assert.equal(classifyRequest('PATCH', '/api/users/abc', 200), null);
});

test('request bodies are redacted and size-limited', () => {
  assert.deepEqual(
    safeBody({ name: 'Speed', password: 'x', nested: { token: 'y', ok: 1 } }),
    { name: 'Speed', password: '[hidden]', nested: { token: '[hidden]', ok: 1 } }
  );
  assert.deepEqual(safeBody({ text: 'x'.repeat(3000) }), { truncated: true });
  assert.equal(safeBody('a string'), null);
  assert.equal(safeBody(null), null);
});

test('entity ids come from the last path segment when it is a UUID', () => {
  const id = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
  assert.equal(entityIdFromPath(`/api/students/${id}`), id);
  assert.equal(entityIdFromPath('/api/students'), null);
});