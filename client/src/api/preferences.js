// Preferences api — on-device adapter over the preferences service (was fetch to
// /api/preferences). Same return shape as before (the bare preferences object),
// so PreferencesProvider and the Preferences page are unchanged.

import { callService } from './local.js';
import {
  getPreferences as getPreferencesService,
  updatePreferences,
  resetPreferences as resetPreferencesService,
} from '@server/core/services/preferences.js';

export async function getPreferences() {
  const { preferences } = await callService(() => getPreferencesService());
  return preferences;
}

export async function savePreferences(changes) {
  const { preferences } = await callService(() => updatePreferences(changes));
  return preferences;
}

export async function resetPreferences() {
  const { preferences } = await callService(() => resetPreferencesService());
  return preferences;
}
