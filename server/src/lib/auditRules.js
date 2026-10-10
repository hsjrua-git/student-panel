import { isUuid } from './ids.js';

const MAX_JSON_LENGTH = 2000;
const SECRET_KEY = /pass|secret|token|hash/i;

// Nicer action/entity labels for the common mutations. Anything not matched here
// (but still a successful mutation) is recorded generically as `api.change`.
const RULES = [
  { method: 'POST', pattern: /^\/api\/students$/, action: 'student.create', entityType: 'student' },
  { method: 'PATCH', pattern: /^\/api\/students\/[^/]+$/, action: 'student.update', entityType: 'student' },
  { method: 'DELETE', pattern: /^\/api\/students\/[^/]+$/, action: 'student.delete', entityType: 'student' },
  { method: 'POST', pattern: /^\/api\/parameters$/, action: 'parameter.create', entityType: 'parameter' },
  { method: 'PATCH', pattern: /^\/api\/parameters\/[^/]+$/, action: 'parameter.update', entityType: 'parameter' },
  { method: 'DELETE', pattern: /^\/api\/parameters\/[^/]+$/, action: 'parameter.delete', entityType: 'parameter' },
  { method: 'POST', pattern: /^\/api\/groups$/, action: 'group.create', entityType: 'group' },
  { method: 'PATCH', pattern: /^\/api\/groups\/[^/]+$/, action: 'group.update', entityType: 'group' },
  { method: 'DELETE', pattern: /^\/api\/groups\/[^/]+$/, action: 'group.delete', entityType: 'group' },
  { method: 'POST', pattern: /^\/api\/periods$/, action: 'period.create', entityType: 'period' },
  { method: 'PATCH', pattern: /^\/api\/periods\/[^/]+$/, action: 'period.update', entityType: 'period' },
  { method: 'DELETE', pattern: /^\/api\/periods\/[^/]+$/, action: 'period.delete', entityType: 'period' },
  { method: 'POST', pattern: /^\/api\/field-definitions$/, action: 'field.create', entityType: 'field' },
  { method: 'PATCH', pattern: /^\/api\/field-definitions\/[^/]+$/, action: 'field.update', entityType: 'field' },
  { method: 'DELETE', pattern: /^\/api\/field-definitions\/[^/]+$/, action: 'field.delete', entityType: 'field' },
  { method: 'POST', pattern: /^\/api\/tasks$/, action: 'task.create', entityType: 'task' },
  { method: 'PATCH', pattern: /^\/api\/tasks\/[^/]+$/, action: 'task.update', entityType: 'task' },
  { method: 'DELETE', pattern: /^\/api\/tasks\/[^/]+$/, action: 'task.delete', entityType: 'task' },
  { method: 'PUT', pattern: /^\/api\/settings$/, action: 'settings.update', entityType: 'setting' },
  { method: 'POST', pattern: /^\/api\/auth\/setup$/, action: 'auth.setup', entityType: 'auth' },
  { method: 'POST', pattern: /^\/api\/auth\/logout$/, action: 'auth.logout', entityType: 'auth' },
  { method: 'POST', pattern: /^\/api\/auth\/change-password$/, action: 'auth.password_change', entityType: 'auth' },
];

// Routes that write their own richer audit entry (so the generic middleware must
// not also log them), or that are personal/noise we deliberately never audit.
const RECORDED_BY_THEIR_OWN_ROUTES = [
  /^\/api\/evaluations\/bulk$/,
  /^\/api\/evaluations\/lock$/,
  /^\/api\/export\/cube$/,
  /^\/api\/tasks\/[^/]+\/completion(\/|$)/,
  /^\/api\/groups\/[^/]+\/members(\/|$)/,
  /^\/api\/preferences$/,
  /^\/api\/saved-views(\/|$)/,
  /^\/api\/students\/import$/,
];

export function normalisePath(url) {
  return url.split('?')[0].replace(/\/+$/, '').toLowerCase();
}

export function classifyRequest(method, path, status) {
  if (method === 'POST' && path === '/api/auth/login') {
    if (status === 200) return { action: 'auth.login', entityType: 'auth' };
    if (status === 401) return { action: 'auth.login_failed', entityType: 'auth' };
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
