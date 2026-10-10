import { Router } from 'express';
import pool from '../db/pool.js';
import {
  mergePreferences,
  parsePreferencesUpdate,
} from '../lib/preferences.js';

// Global (single-operator) preferences. Migration 001 keeps a single settings
// row in `preferences` (id = 1, CHECK id = 1), seeded on install, so there is
// always exactly one row to read and merge over the defaults.

const router = Router();

router.get('/', async (_req, res) => {
  const result = await pool.query('SELECT settings FROM preferences WHERE id = 1');
  res.json({ preferences: mergePreferences(result.rows[0]?.settings) });
});

router.put('/', async (req, res) => {
  const parsed = parsePreferencesUpdate(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const result = await pool.query(
    `INSERT INTO preferences (id, settings)
     VALUES (1, $1::jsonb)
     ON CONFLICT (id)
     DO UPDATE SET settings = preferences.settings || EXCLUDED.settings,
                   updated_at = now()
     RETURNING settings`,
    [JSON.stringify(parsed.values)]
  );
  res.json({ preferences: mergePreferences(result.rows[0].settings) });
});

router.delete('/', async (_req, res) => {
  await pool.query(
    "UPDATE preferences SET settings = '{}'::jsonb, updated_at = now() WHERE id = 1"
  );
  res.json({ preferences: mergePreferences({}) });
});

export default router;
