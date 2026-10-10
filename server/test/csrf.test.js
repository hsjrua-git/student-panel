import './_env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCsrf } from '../src/middleware/csrf.js';

function mkReq({ method = 'GET', cookie, origin, referer, host, csrfHeader, secure = false } = {}) {
  const headers = {};
  if (cookie !== undefined) headers.cookie = cookie;
  if (origin !== undefined) headers.origin = origin;
  if (referer !== undefined) headers.referer = referer;
  if (host !== undefined) headers.host = host;
  if (csrfHeader !== undefined) headers['x-csrf-token'] = csrfHeader;
  return { method, headers, secure, get(name) { return headers[name.toLowerCase()]; } };
}

function mkRes() {
  return {
    statusCode: 200,
    body: null,
    cookies: [],
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    cookie(name, val, opts) { this.cookies.push({ name, val, opts }); return this; },
  };
}

function run(mw, req) {
  const res = mkRes();
  let nexted = false;
  mw(req, res, () => { nexted = true; });
  return { res, nexted };
}

const csrf = createCsrf({ secure: false, enforceOrigin: true });

test('issue sets a csrf cookie only when none is present', () => {
  const a = run(csrf.issue, mkReq());
  assert.equal(a.nexted, true);
  assert.equal(a.res.cookies.length, 1);
  assert.equal(a.res.cookies[0].name, 'csrf');

  const b = run(csrf.issue, mkReq({ cookie: 'csrf=existing' }));
  assert.equal(b.res.cookies.length, 0);
});

test('checkOrigin allows safe methods, same-origin, and header-less requests', () => {
  assert.equal(run(csrf.checkOrigin, mkReq({ method: 'GET' })).nexted, true);
  assert.equal(run(csrf.checkOrigin, mkReq({ method: 'POST', host: 'host' })).nexted, true);
  assert.equal(
    run(csrf.checkOrigin, mkReq({ method: 'POST', origin: 'http://host', host: 'host' })).nexted,
    true
  );
});

test('checkOrigin rejects a cross-origin mutation but is off when not enforced', () => {
  const bad = run(csrf.checkOrigin, mkReq({ method: 'POST', origin: 'http://evil.com', host: 'host' }));
  assert.equal(bad.nexted, false);
  assert.equal(bad.res.statusCode, 403);
  assert.equal(bad.res.body.code, 'CSRF_ORIGIN');

  const lax = createCsrf({ secure: false, enforceOrigin: false });
  assert.equal(
    run(lax.checkOrigin, mkReq({ method: 'POST', origin: 'http://evil.com', host: 'host' })).nexted,
    true
  );
});

test('verifyToken enforces the double-submit token on mutations', () => {
  assert.equal(run(csrf.verifyToken, mkReq({ method: 'GET' })).nexted, true);
  assert.equal(
    run(csrf.verifyToken, mkReq({ method: 'POST', cookie: 'csrf=abc', csrfHeader: 'abc' })).nexted,
    true
  );
  const missing = run(csrf.verifyToken, mkReq({ method: 'POST', cookie: 'csrf=abc' }));
  assert.equal(missing.res.statusCode, 403);
  assert.equal(missing.res.body.code, 'CSRF');
  const mismatch = run(csrf.verifyToken, mkReq({ method: 'POST', cookie: 'csrf=abc', csrfHeader: 'abd' }));
  assert.equal(mismatch.res.statusCode, 403);
});
