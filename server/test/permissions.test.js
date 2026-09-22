import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

const BASE = process.env.TEST_SERVER_URL ?? 'http://localhost:3000';

function jar() {
  const store = new Map();
  return {
    header(response) {
      const set = response.headers.getSetCookie?.() ?? [];
      for (const line of set) {
        const [pair] = line.split(';');
        const [key, value] = pair.split('=');
        store.set(key, value);
      }
    },
    cookie() {
      return [...store.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
  };
}

async function call(path, { method = 'GET', body, cookieJar } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookieJar ? { Cookie: cookieJar.cookie() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  cookieJar?.header(response);
  return response;
}

async function loginAs(username, password) {
  const cookieJar = jar();
  const response = await call('/api/auth/login', {
    method: 'POST',
    body: { username, password },
    cookieJar,
  });
  assert.equal(response.status, 200, `login as ${username} should succeed`);
  return cookieJar;
}

// One representative request per protected route. GET-only routes are
// tested with GET; routes that also accept writes are tested once per
// method actually used elsewhere in the app.
const ROUTES = [
  { method: 'GET', path: '/api/students' },
  { method: 'POST', path: '/api/students', body: { fullName: 'Permission Test' } },
  { method: 'GET', path: '/api/students/00000000-0000-0000-0000-000000000000' },
  { method: 'PATCH', path: '/api/students/00000000-0000-0000-0000-000000000000', body: { fullName: 'x' } },
  { method: 'DELETE', path: '/api/students/00000000-0000-0000-0000-000000000000' },
  { method: 'POST', path: '/api/students/import', body: { rows: [] } },
  { method: 'GET', path: '/api/parameters' },
  { method: 'POST', path: '/api/parameters', body: { name: 'x', startPeriod: 1 } },
  { method: 'PATCH', path: '/api/parameters/00000000-0000-0000-0000-000000000000', body: {} },
  { method: 'GET', path: '/api/parameter-changes' },
  { method: 'POST', path: '/api/parameter-changes', body: {} },
  { method: 'GET', path: '/api/parameter-changes/impact' },
  { method: 'DELETE', path: '/api/parameter-changes/00000000-0000-0000-0000-000000000000' },
  { method: 'GET', path: '/api/periods' },
  { method: 'GET', path: '/api/periods/1/parameters' },
  { method: 'GET', path: '/api/settings/period-anchor' },
  { method: 'PUT', path: '/api/settings/period-anchor', body: { anchorDate: '2026-01-03' } },
  { method: 'GET', path: '/api/evaluations?periodNumber=1' },
  { method: 'PUT', path: '/api/evaluations/bulk', body: { periodNumber: 1, entries: [] } },
  { method: 'GET', path: '/api/results?periodNumber=1' },
  { method: 'GET', path: '/api/dashboard/trends' },
  { method: 'GET', path: '/api/saved-views' },
  { method: 'POST', path: '/api/saved-views', body: {} },
  { method: 'PUT', path: '/api/saved-views/00000000-0000-0000-0000-000000000000', body: {} },
  { method: 'DELETE', path: '/api/saved-views/00000000-0000-0000-0000-000000000000' },
  { method: 'GET', path: '/api/preferences' },
  { method: 'PUT', path: '/api/preferences', body: {} },
  { method: 'DELETE', path: '/api/preferences' },
  { method: 'GET', path: '/api/audit' },
  { method: 'GET', path: '/api/users' },
  { method: 'POST', path: '/api/users', body: {} },
  { method: 'PATCH', path: '/api/users/00000000-0000-0000-0000-000000000000', body: {} },
  { method: 'POST', path: '/api/users/00000000-0000-0000-0000-000000000000/reset-password' },
];

let admin;
let staff;
let viewer;

before(async () => {
  execSync('npm run migrate', { stdio: 'ignore' });
  admin = await loginAs('admin', process.env.TEST_ADMIN_PASSWORD ?? 'correct-horse-battery');
  staff = await loginAs('staff1', process.env.TEST_STAFF_PASSWORD ?? 'change-me');
  viewer = await loginAs('viewer1', process.env.TEST_VIEWER_PASSWORD ?? 'change-me');
});

test('every route in the list refuses an unauthenticated request', async () => {
  for (const route of ROUTES) {
    const response = await call(route.path, { method: route.method, body: route.body });
    assert.equal(
      response.status,
      401,
      `${route.method} ${route.path} should require sign-in, got ${response.status}`
    );
  }
});

test('a signed-in viewer never gets a 401, and admin-only routes stay closed to staff', async () => {
  const adminOnly = new Set([
    'DELETE /api/students/00000000-0000-0000-0000-000000000000',
    'POST /api/students/import',
    'POST /api/parameters',
    'PATCH /api/parameters/00000000-0000-0000-0000-000000000000',
    'POST /api/parameter-changes',
    'DELETE /api/parameter-changes/00000000-0000-0000-0000-000000000000',
    'PUT /api/settings/period-anchor',
    'GET /api/audit',
    'GET /api/users',
    'POST /api/users',
    'PATCH /api/users/00000000-0000-0000-0000-000000000000',
    'POST /api/users/00000000-0000-0000-0000-000000000000/reset-password',
  ]);

  for (const route of ROUTES) {
    const asViewer = await call(route.path, {
      method: route.method,
      body: route.body,
      cookieJar: viewer,
    });
    assert.notEqual(
      asViewer.status,
      401,
      `${route.method} ${route.path} rejected a signed-in viewer entirely`
    );

    const key = `${route.method} ${route.path}`;
    if (adminOnly.has(key)) {
      const asStaff = await call(route.path, {
        method: route.method,
        body: route.body,
        cookieJar: staff,
      });
      assert.equal(
        asStaff.status,
        403,
        `${key} should be admin-only, but staff got ${asStaff.status}`
      );
    }
  }
});

test('admin can reach every route without a permission error', async () => {
  for (const route of ROUTES) {
    const response = await call(route.path, {
      method: route.method,
      body: route.body,
      cookieJar: admin,
    });
    assert.notEqual(
      response.status,
      401,
      `${route.method} ${route.path} rejected admin`
    );
    assert.notEqual(
      response.status,
      403,
      `${route.method} ${route.path} rejected admin`
    );
  }
});