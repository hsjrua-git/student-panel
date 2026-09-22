import { isUuid } from './ids.js';

const MAX_JSON_LENGTH = 2000;
const SECRET_KEY = /pass|secret|token|hash/i;

const RULES = [
  { method: 'POST', pattern: /^\/api\/students$/, action: 'student.create', entityType: 'student' },
  { method: 'PATCH', pattern: /^\/api\/students\/[^/]+$/, action: 'student.update', entityType: 'student' },
  { method: 'DELETE', pattern: /^\/api\/students\/[^/]+$/, action: 'student.delete', entityType: 'student' },
  { method: 'POST', pattern: /^\/api\/parameters$/, action: 'parameter.create', entityType: 'parameter' },
  { method: 'PATCH', pattern: /^\/api\/parameters\/[^/]+$/, action: 'parameter.update', entityType: 'parameter' },
  { method: 'POST', pattern: /^\/api\/parameter-changes$/, action: 'parameter_change.create', entityType: 'parameter_change' },
  { method: 'DELETE', pattern: /^\/api\/parameter-changes\/[^/]+$/, action: 'parameter_change.delete', entityType: 'parameter_change' },
  { method: 'PUT', pattern: /^\/api\/settings\/period-anchor$/, action: 'settings.period_anchor', entityType: 'setting' },
  { method: 'POST', pattern: /^\/api\/auth\/logout$/, action: 'auth.logout', entityType: 'user' },
  { method: 'POST', pattern: /^\/api\/auth\/change-password$/, action: 'auth.password_change', entityType: 'user' },
];

const RECORDED_BY_THEIR_OWN_ROUTES = [
  /^\/api\/evaluations\/bulk$/,
  /^\/api\/users(\/|$)/,
  /^\/api\/preferences$/,
  /^\/api\/saved-views(\/|$)/,
  /^\/api\/students\/import$/,
  /^\/api\/roles(\/|$)/,
  /^\/api\/groups(\/|$)/,
  /^\/api\/field-definitions(\/|$)/,
];

export function normalisePath(url) {
  return url.split('?')[0].replace(/\/+$/, '').toLowerCase();
}

export function classifyRequest(method, path, status) {
  if (method === 'POST' && path === '/api/auth/login') {
    if (status === 200) return { action: 'auth.login', entityType: 'user' };
    if (status === 401) return { action: 'auth.login_failed', entityType: 'user' };
    return null;
  }
  if (status < 200 || status >= 300) return null;
  if (RECORDED_BY_THEIR_OWN_ROUTES.some((pattern) => pattern.test(path))) {
    return null;
  }

  const rule = RULES.find(
    (item) => item.method === method && item.pattern.test(path)
  );
  if (rule) return { action: rule.action, entityType: rule.entityType };
  return { action: 'api.change', entityType: null };
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        SECRET_KEY.test(key) ? '[hidden]' : redact(inner),
      ])
    );
  }
  return value;
}

export function safeBody(value) {
  if (value === null || typeof value !== 'object') return null;
  const cleaned = redact(value);
  return JSON.stringify(cleaned).length > MAX_JSON_LENGTH
    ? { truncated: true }
    : cleaned;
}

export function entityIdFromPath(path) {
  const last = path.split('/').pop();
  return isUuid(last) ? last : null;
}