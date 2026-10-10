import { request } from './http.js';

// App-wide settings for the single operator: the operator's display name and
// the app title shown in the shell. (The password lives behind /api/auth.)
//   { operatorName, appTitle }
export function getSettings() {
  return request('/api/settings');
}

// Partial update: { operatorName?, appTitle? } -> the updated settings.
export function updateSettings(fields) {
  return request('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(fields),
  });
}
