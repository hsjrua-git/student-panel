import { request } from './http.js';

// Single-operator auth. There are no users or roles: `GET /api/auth/me` returns
// the app's auth state, not a user object.
//   { authed, initialized, operatorName, appTitle }
export function fetchMe() {
  return request('/api/auth/me');
}

// First-run setup: choose the single password (and an optional operator name).
// Signs the session in on success. Returns { authed, initialized, operatorName }.
export function setup({ password, operatorName }) {
  return request('/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify({ password, operatorName }),
  });
}

export function login({ password }) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function logout() {
  return request('/api/auth/logout', { method: 'POST' });
}

export function changePassword({ currentPassword, newPassword }) {
  return request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
