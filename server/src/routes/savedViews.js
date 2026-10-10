import { Router } from 'express';
import pool from '../db/pool.js';
import { isUuid } from '../lib/ids.js';
import { MAX_VIEWS, parseViewConfig, parseViewName } from '../lib/savedViews.js';

// Global (single-operator) saved views. Migration 001 defines `saved_views`
// with no owner column and a unique index on lower(name), so views are shared
// and names are case-insensitively unique across the whole install.

const router = Router();
const UNIQUE_VIOLATION = '23505';
const COLUMNS = `id, name, config, updated_at AS "updatedAt"`;
const DUPLICATE = 'A view with that name already exists.';

router.param('id', (req, res, next, value) => {
  if (!isUuid(value)) {
    return res.status(404).json({ error: 'View not found.' });
  }
  next();
});

router.get('/', async (_req, res) => {
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM saved_views ORDER BY lower(name)`
  );
  res.json({ views: result.rows });
});

router.post('/', async (req, res) => {
  const name = parseViewName(req.body?.name);
  if (name.error) return res.status(400).json({ error: name.error });
  const config = parseViewConfig(req.body?.config);
  if (config.error) return res.status(400).json({ error: config.error });

  const count = await pool.query('SELECT count(*)::int AS count FROM saved_views');
  if (count.rows[0].count >= MAX_VIEWS) {
    return res.status(409).json({
      error: `You can keep at most ${MAX_VIEWS} saved views. Delete one first.`,
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO saved_views (name, config)
       VALUES ($1, $2::jsonb)
       RETURNING ${COLUMNS}`,
      [name.value, JSON.stringify(config.value)]
    );
    res.status(201).json({ view: result.rows[0] });
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: DUPLICATE });
    }
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const body = req.body ?? {};
  const assignments = [];
  const values = [];

  if ('name' in body) {
    const name = parseViewName(body.name);
    if (name.error) return res.status(400).json({ error: name.error });
    values.push(name.value);
    assignments.push(`name = $${values.length}`);
  }
  if ('config' in body) {
    const config = parseViewConfig(body.config);
    if (config.error) return res.status(400).json({ error: config.error });
    values.push(JSON.stringify(config.value));
    assignments.push(`config = $${values.length}::jsonb`);
  }
  if (assignments.length === 0) {
    return res.status(400).json({ error: 'Nothing to change.' });
  }

  values.push(req.params.id);
  try {
    const result = await pool.query(
      `UPDATE saved_views
       SET ${assignments.join(', ')}, updated_at = now()
       WHERE id = $${values.length}
       RETURNING ${COLUMNS}`,
      values
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'View not found.' });
    }
    res.json({ view: result.rows[0] });
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: DUPLICATE });
    }
    throw err;
  }
});

router.delete('/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM saved_views WHERE id = $1', [
    req.params.id,
  ]);
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'View not found.' });
  }
  res.status(204).end();
});

export default router;
