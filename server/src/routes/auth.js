import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import pool from '../db/pool.js';
import {
  MAX_PASSWORD_LENGTH,
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from '../lib/passwords.js';
import {
  KEYS,
  getSetting,
  isInitialized,
  setSetting,
  getPublicSettings,
} from '../lib/settings.js';
import { requireLogin } from '../middleware/auth.js';

const router = Router();

let dummyHash;
async function getDummyHash() {
  dummyHash ??= await hashPassword('a password that nobody uses');
  return dummyHash;
}

function viaCallback(run) {
  return new Promise((resolve, reject) => {
    run((err) => (err ? reject(err) : resolve()));
  });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many failed attempts. Please wait 15 minutes and try again.',
  },
});

// Mark the current session signed-in. Regenerate first so a pre-login session
// id can never be reused as a signed-in one (session fixation defence).
async function signIn(req) {
  await viaCallback((done) => req.session.regenerate(done));
  req.session.authed = true;
  await viaCallback((done) => req.session.save(done));
}

// The client bootstraps from this: `initialized` decides whether to show the
// first-run "create a password" screen or the normal login, and `authed` tells
// it whether a session already exists. Always 200 (no session is not an error).
router.get('/me', async (req, res) => {
  const initialized = await isInitialized();
  const settings = await getPublicSettings();
  res.json({
    authed: Boolean(req.authed),
    initialized,
    operatorName: settings[KEYS.operatorName] ?? 'operator',
    appTitle: settings[KEYS.appTitle] ?? null,
  });
});

// First-run setup: choose the single password. Only works before initialization.
router.post('/setup', loginLimiter, async (req, res) => {
  if (await isInitialized()) {
    return res.status(409).json({ error: 'A password has already been set.' });
  }
  const { password, operatorName } = req.body ?? {};
  const problem = validateNewPassword(password);
  if (problem) return res.status(400).json({ error: problem });

  await setSetting(KEYS.passwordHash, await hashPassword(password));
  await setSetting(KEYS.initialized, 'true');
  const name =
    typeof operatorName === 'string' && operatorName.trim()
      ? operatorName.trim().slice(0, 60)
      : 'operator';
  await setSetting(KEYS.operatorName, name);

  await signIn(req);
  res.json({ authed: true, initialized: true, operatorName: name });
});

router.post('/login', loginLimiter, async (req, res) => {
  const password =
    typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password || password.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({ error: 'Enter your password.' });
  }
  if (!(await isInitialized())) {
    return res
      .status(409)
      .json({ error: 'No password has been set yet.', code: 'NOT_INITIALIZED' });
  }

  const hash = (await getSetting(KEYS.passwordHash)) ?? (await getDummyHash());
  const ok = await verifyPassword(hash, password);
  if (!ok) {
    return res.status(401).json({ error: 'Wrong password.' });
  }

  await signIn(req);
  res.json({ authed: true });
});

router.post('/logout', async (req, res) => {
  await viaCallback((done) => req.session.destroy(done));
  res.clearCookie('sid');
  res.status(204).end();
});

router.post('/change-password', requireLogin, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};

  if (
    typeof currentPassword !== 'string' ||
    currentPassword === '' ||
    currentPassword.length > MAX_PASSWORD_LENGTH
  ) {
    return res.status(400).json({ error: 'Enter your current password.' });
  }
  const problem = validateNewPassword(newPassword);
  if (problem) return res.status(400).json({ error: problem });
  if (newPassword === currentPassword) {
    return res.status(400).json({
      error: 'The new password must be different from the current one.',
    });
  }

  const hash = await getSetting(KEYS.passwordHash);
  if (!hash || !(await verifyPassword(hash, currentPassword))) {
    return res.status(400).json({ error: 'The current password is incorrect.' });
  }

  await setSetting(KEYS.passwordHash, await hashPassword(newPassword));
  // Sign every other device out; keep this session.
  await pool.query('DELETE FROM user_sessions WHERE sid <> $1', [req.sessionID]);

  res.json({ authed: true });
});

export default router;
