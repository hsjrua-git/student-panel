// Auth api — on-device adapter over the single-user service (was fetch to
// /api/auth/*). There is no login, session, or password on device: the one
// person owns the phone and is the administrator. So fetchMe() returns the
// seeded local admin, and login/logout/changePassword are kept only so the
// existing AuthProvider mutations still resolve — they are effectively no-ops.

import { callService } from './local.js';
import { getMe } from '@server/core/services/auth.js';

export async function fetchMe() {
  const { user } = await callService(() => getMe());
  return user;
}

// The login form isn't reachable on device (RequireAuth always has a user), but
// resolving to the current user keeps the mutation contract intact.
export async function login() {
  const { user } = await callService(() => getMe());
  return user;
}

// Nothing to tear down — there is no session.
export async function logout() {
  return;
}

export async function changePassword() {
  const { user } = await callService(() => getMe());
  return user;
}
