import { Router } from 'express';
import pool from '../db/pool.js';
import { FIELD_TYPES } from '../lib/fields.js';
import { isUuid } from '../lib/ids.js';

// Custom student-field definitions. Single-operator build: no per-user
// ownership (`created_by` dropped) and no permission gating — the middleware
// auto-audits create/update/delete, so this router does not record its own.

const router = Router();
const UNIQUE_VIOLATION = '23505';

const DEFINITION_COLUMNS = `
  id,
  label,
  field_type    AS "fieldType",
  choices,
  is_restricted AS "isRestricted",
  sort_order    AS "sortOrder",
  archived_at   AS "archivedAt"
`;

function parseLabel(input) {
  if (typeof input !== 'string') return { error: 'Field label is required.' };
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length < 1 || value.length > 60) {
    return { error: 'Field label must be 1 to 60 characters.' };
  }
  return { value };
}

function parseChoices(input) {
  if (input === undefined) return { value: [] };
  if (!Array.isArray(input)) return { error: 'Choices must be a list.' };
  const seen = new Set();
  const value = [];
  for (const choice of input) {
    if (typeof choice !== 'string') return { error: 'Each choice must be text.' };
    const trimmed = choice.trim();
    if (trimmed === '') continue;
    if (trimmed.length > 60) return { error: 'A choice is too long (max 60).' };
    if (!seen.has(trimmed.toLowerCase())) {
      seen.add(trimmed.toLowerCase());
      value.push(trimmed);
    }
  }
  return { value };
}

router.param('id', (req, res, next, value) => {
  if (!isUuid(value)) {
    return res.status(404).json({ error: 'Field not found.' });
  }
  next();
});

router.get('/', async (req, res) => {
  const includeArchived = req.query.includeArchived === '1';
  const result = await pool.query(
    `SELECT ${DEFINITION_COLUMNS}
     FROM student_field_definitions
     WHERE ($1 OR archived_at IS NULL)
     ORDER BY sort_order, lower(label)`,
    [includeArchived]
  );
  res.json({ fields: result.rows });
});

router.post('/', async (req, res) => {
  const label = parseLabel(req.body?.label);
  if (label.error) return res.status(400).json({ error: label.error });

  const fieldType = req.body?.fieldType;
  if (!FIELD_TYPES.includes(fieldType)) {
    return res.status(400).json({ error: 'Choose a valid field type.' });
  }
  const choices = parseChoices(req.body?.choices);
  if (choices.error) return res.status(400).json({ error: choices.error });
  if (fieldType === 'choice' && choices.value.length === 0) {
    return res.status(400).json({ error: 'A choice field needs at least one choice.' });
  }
  const isRestricted = req.body?.isRestricted === true;

  try {
    const inserted = await pool.query(
      `INSERT INTO student_field_definitions
         (label, field_type, choices, is_restricted, sort_order)
       VALUES ($1, $2, $3::jsonb, $4,
               (SELECT COALESCE(max(sort_order), 0) + 1 FROM student_field_definitions))
       RETURNING ${DEFINITION_COLUMNS}`,
      [
        label.value,
        fieldType,
        JSON.stringify(fieldType === 'choice' ? choices.value : []),
        isRestricted,
      ]
    );
    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'A field with that label already exists.' });
    }
    throw err;
  }
});

router.patch('/:id', async (req, res) => {
  const body = req.body ?? {};
  if ('fieldType' in body) {
    return res.status(400).json({
      error: 'A field type cannot be changed. Create a new field instead.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingResult = await client.query(
      `SELECT ${DEFINITION_COLUMNS} FROM student_field_definitions
       WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (existingResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Field not found.' });
    }
    const field = existingResult.rows[0];

    const sets = [];
    const values = [];

    if ('label' in body) {
      const label = parseLabel(body.label);
      if (label.error) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: label.error });
      }
      values.push(label.value);
      sets.push(`label = $${values.length}`);
    }
    if ('isRestricted' in body) {
      if (typeof body.isRestricted !== 'boolean') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'isRestricted must be true or false.' });
      }
      values.push(body.isRestricted);
      sets.push(`is_restricted = $${values.length}`);
    }
    if ('sortOrder' in body) {
      if (!Number.isInteger(body.sortOrder)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'sortOrder must be a whole number.' });
      }
      values.push(body.sortOrder);
      sets.push(`sort_order = $${values.length}`);
    }
    if ('choices' in body) {
      if (field.fieldType !== 'choice') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Only choice fields have choices.' });
      }
      const choices = parseChoices(body.choices);
      if (choices.error) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: choices.error });
      }
      if (choices.value.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'A choice field needs at least one choice.' });
      }
      // Don't remove a choice that some student is currently using.
      const usedResult = await client.query(
        `SELECT DISTINCT extra->>$1 AS value
         FROM students
         WHERE extra ? $1 AND deleted_at IS NULL`,
        [field.id]
      );
      const used = usedResult.rows.map((row) => row.value).filter(Boolean);
      const removed = used.filter((value) => !choices.value.includes(value));
      if (removed.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `These choices are still in use and cannot be removed: ${removed.join(', ')}.`,
        });
      }
      values.push(JSON.stringify(choices.value));
      sets.push(`choices = $${values.length}::jsonb`);
    }
    if ('archived' in body) {
      if (typeof body.archived !== 'boolean') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'archived must be true or false.' });
      }
      sets.push(`archived_at = ${body.archived ? 'now()' : 'NULL'}`);
    }

    if (sets.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Nothing to change.' });
    }

    values.push(field.id);
    const updated = await client.query(
      `UPDATE student_field_definitions SET ${sets.join(', ')}
       WHERE id = $${values.length}
       RETURNING ${DEFINITION_COLUMNS}`,
      values
    );
    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'A field with that label already exists.' });
    }
    throw err;
  } finally {
    client.release();
  }
});

// DELETE archives the field (values stay in students.extra, just hidden).
router.delete('/:id', async (req, res) => {
  const updated = await pool.query(
    `UPDATE student_field_definitions SET archived_at = now()
     WHERE id = $1 AND archived_at IS NULL
     RETURNING id`,
    [req.params.id]
  );
  if (updated.rowCount === 0) {
    // Either it doesn't exist or it's already archived; treat as done.
    const exists = await pool.query(
      'SELECT 1 FROM student_field_definitions WHERE id = $1',
      [req.params.id]
    );
    return exists.rowCount === 0
      ? res.status(404).json({ error: 'Field not found.' })
      : res.status(204).end();
  }
  res.status(204).end();
});

export default router;
