import { Router } from 'express';
import { getPublicSettings, setSetting, KEYS } from '../lib/settings.js';

// Public app settings (operator display name + app title). The password hash and
// other secret keys live in the same table but are never exposed here. The
// middleware auto-audits a successful PUT as `settings.update`.

const router = Router();

function parseName(input) {
  if (typeof input !== 'string') return { error: 'Operator name must be text.' };
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length < 1 || value.length > 60) {
    return { error: 'Operator name must be 1 to 60 characters.' };
  }
  return { value };
}

function parseTitle(input) {
  if (typeof input !== 'string') return { error: 'App title must be text.' };
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length < 1 || value.length > 80) {
    return { error: 'App title must be 1 to 80 characters.' };
  }
  return { value };
}

// Map the stored key/value pairs to friendly camelCase keys for the client.
function present(raw) {
  return {
    operatorName: raw[KEYS.operatorName] ?? 'operator',
    appTitle: raw[KEYS.appTitle] ?? 'Student Panel',
  };
}

router.get('/', async (req, res) => {
  res.json(present(await getPublicSettings()));
});

router.put('/', async (req, res) => {
  const body = req.body ?? {};
  const updates = [];

  if ('operatorName' in body) {
    const parsed = parseName(body.operatorName);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    updates.push([KEYS.operatorName, parsed.value]);
  }
  if ('appTitle' in body) {
    const parsed = parseTitle(body.appTitle);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    updates.push([KEYS.appTitle, parsed.value]);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Nothing to change.' });
  }

  for (const [key, value] of updates) {
    await setSetting(key, value);
  }
  res.json(present(await getPublicSettings()));
});

export default router;
