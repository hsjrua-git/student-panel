import { Router } from 'express';
import pool from '../db/pool.js';
import { parseParameterInput } from '../validation/parameter.js';
import {
  fetchParameterRows,
  buildParameterTree,
} from '../lib/parameters.js';
import { flattenForest, isAncestor } from '../lib/tree.js';
import { isUuid } from '../lib/ids.js';

// Parameters form a tree of any depth. Only LEAF parameters are scored; a
// parent's value/range/norm is derived at read time (see lib/parameters.js), so
// the tree can be reshaped without rewriting score history. Single-operator
// build: standard create/update/delete are auto-audited by the middleware, so
// this router records none of its own.

const router = Router();
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const FK_VIOLATION = '23503';

const ASSIGNMENT_COLUMNS = `
  id,
  parameter_id AS "parameterId",
  group_id     AS "groupId",
  student_id   AS "studentId",
  created_at   AS "createdAt"
`;

// Flatten the (effective-annotated) tree to a depth-tagged list without the
// nested `children` arrays, which the API doesn't need to ship.
function flatList(rows) {
  return flattenForest(buildParameterTree(rows)).map(({ children, ...node }) => node);
}

function handleWriteError(err, res) {
  if (err.code === UNIQUE_VIOLATION) {
    res.status(409).json({ error: 'A parameter with that name already exists.' });
    return true;
  }
  if (err.code === CHECK_VIOLATION) {
    res.status(400).json({ error: 'Check the range and norm values.' });
    return true;
  }
  return false;
}

router.param('id', (req, res, next, value) => {
  if (!isUuid(value)) return res.status(404).json({ error: 'Parameter not found.' });
  next();
});

// List every parameter as a flat, depth-tagged list (each carries `isLeaf` and
// an `effective` range/norm derived from its children). ?includeArchived=1
// includes archived parameters.
router.get('/', async (req, res) => {
  const includeArchived = req.query.includeArchived === '1';
  const rows = await fetchParameterRows(pool, { includeArchived });
  res.json({ parameters: flatList(rows) });
});

// A single parameter with its derived fields plus the groups/students it is
// assigned to (their names resolved).
router.get('/:id', async (req, res) => {
  const rows = await fetchParameterRows(pool, { includeArchived: true });
  const node = flatList(rows).find((p) => p.id === req.params.id);
  if (!node) return res.status(404).json({ error: 'Parameter not found.' });

  const assignments = await pool.query(
    `SELECT ${ASSIGNMENT_COLUMNS},
            g.name         AS "groupName",
            s.full_name    AS "studentName",
            s.student_code AS "studentCode"
       FROM parameter_assignments pa
       LEFT JOIN student_groups g ON g.id = pa.group_id
       LEFT JOIN students s       ON s.id = pa.student_id
      WHERE pa.parameter_id = $1
      ORDER BY pa.created_at`,
    [req.params.id]
  );
  res.json({ ...node, assignments: assignments.rows });
});

router.post('/', async (req, res) => {
  const parsed = parseParameterInput(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const {
    name,
    parentId = null,
    unit = null,
    minValue = null,
    maxValue = null,
    normMin = null,
    normMax = null,
    extra = {},
  } = parsed.values;

  if (parentId !== null) {
    const parent = await pool.query(
      'SELECT archived_at FROM parameters WHERE id = $1',
      [parentId]
    );
    if (parent.rowCount === 0 || parent.rows[0].archived_at) {
      return res.status(400).json({ error: 'That parent parameter does not exist.' });
    }
  }

  try {
    const created = await pool.query(
      `INSERT INTO parameters
         (parent_id, name, unit, min_value, max_value, norm_min, norm_max, extra, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb,
               (SELECT COALESCE(max(sort_order), 0) + 1 FROM parameters))
       RETURNING id`,
      [parentId, name, unit, minValue, maxValue, normMin, normMax, JSON.stringify(extra)]
    );
    const rows = await fetchParameterRows(pool, { includeArchived: true });
    const node = flatList(rows).find((p) => p.id === created.rows[0].id);
    res.status(201).json(node);
  } catch (err) {
    if (handleWriteError(err, res)) return;
    throw err;
  }
});

const COLUMN = {
  name: 'name',
  parentId: 'parent_id',
  unit: 'unit',
  minValue: 'min_value',
  maxValue: 'max_value',
  normMin: 'norm_min',
  normMax: 'norm_max',
  sortOrder: 'sort_order',
};

async function liveChildCount(id) {
  const result = await pool.query(
    `SELECT count(*)::int AS count FROM parameters
      WHERE parent_id = $1 AND archived_at IS NULL`,
    [id]
  );
  return result.rows[0].count;
}

router.patch('/:id', async (req, res) => {
  const parsed = parseParameterInput(req.body, { partial: true });
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const exists = await pool.query('SELECT 1 FROM parameters WHERE id = $1', [req.params.id]);
  if (exists.rowCount === 0) return res.status(404).json({ error: 'Parameter not found.' });

  const values = parsed.values;
  const sets = [];
  const params = [];

  // Re-parenting: reject self-parenting and cycles.
  if ('parentId' in values && values.parentId !== null) {
    if (values.parentId === req.params.id) {
      return res.status(400).json({ error: 'A parameter cannot be its own parent.' });
    }
    const parent = await pool.query(
      'SELECT archived_at FROM parameters WHERE id = $1',
      [values.parentId]
    );
    if (parent.rowCount === 0 || parent.rows[0].archived_at) {
      return res.status(400).json({ error: 'That parent parameter does not exist.' });
    }
    const rows = await fetchParameterRows(pool, { includeArchived: true });
    const parentById = new Map(rows.map((r) => [r.id, r.parentId ?? null]));
    if (isAncestor(parentById, req.params.id, values.parentId)) {
      return res.status(400).json({ error: 'A parameter cannot be moved inside itself.' });
    }
  }

  for (const [key, column] of Object.entries(COLUMN)) {
    if (key in values) {
      params.push(values[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  if ('extra' in values) {
    params.push(JSON.stringify(values.extra));
    sets.push(`extra = $${params.length}::jsonb`);
  }
  if ('archived' in req.body) {
    if (typeof req.body.archived !== 'boolean') {
      return res.status(400).json({ error: 'archived must be true or false.' });
    }
    if (req.body.archived && (await liveChildCount(req.params.id)) > 0) {
      return res.status(409).json({ error: 'Archive or move the child parameters first.' });
    }
    sets.push(`archived_at = ${req.body.archived ? 'now()' : 'NULL'}`);
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'Nothing to change.' });
  }

  params.push(req.params.id);
  try {
    const updated = await pool.query(
      `UPDATE parameters SET ${sets.join(', ')}
        WHERE id = $${params.length}
        RETURNING id`,
      params
    );
    if (updated.rowCount === 0) return res.status(404).json({ error: 'Parameter not found.' });
    const rows = await fetchParameterRows(pool, { includeArchived: true });
    res.json(flatList(rows).find((p) => p.id === req.params.id));
  } catch (err) {
    if (handleWriteError(err, res)) return;
    throw err;
  }
});

// DELETE soft-archives the parameter (its scores stay, just hidden). A parameter
// with live children can't be archived until they are moved or archived.
router.delete('/:id', async (req, res) => {
  if ((await liveChildCount(req.params.id)) > 0) {
    return res.status(409).json({ error: 'Archive or move the child parameters first.' });
  }
  const updated = await pool.query(
    `UPDATE parameters SET archived_at = now()
      WHERE id = $1 AND archived_at IS NULL
      RETURNING id`,
    [req.params.id]
  );
  if (updated.rowCount === 0) {
    const stillThere = await pool.query('SELECT 1 FROM parameters WHERE id = $1', [req.params.id]);
    return stillThere.rowCount === 0
      ? res.status(404).json({ error: 'Parameter not found.' })
      : res.status(204).end();
  }
  res.status(204).end();
});

// Assign a parameter to exactly one target (a group or a student).
router.post('/:id/assignments', async (req, res) => {
  const body = req.body ?? {};
  const groupId = body.groupId ?? null;
  const studentId = body.studentId ?? null;

  if ((groupId !== null) === (studentId !== null)) {
    return res.status(400).json({ error: 'Assign to exactly one of a group or a student.' });
  }
  if (groupId !== null && !isUuid(groupId)) {
    return res.status(400).json({ error: 'groupId must be a valid ID.' });
  }
  if (studentId !== null && !isUuid(studentId)) {
    return res.status(400).json({ error: 'studentId must be a valid ID.' });
  }

  const parameter = await pool.query('SELECT 1 FROM parameters WHERE id = $1', [req.params.id]);
  if (parameter.rowCount === 0) return res.status(404).json({ error: 'Parameter not found.' });

  try {
    const inserted = await pool.query(
      `INSERT INTO parameter_assignments (parameter_id, group_id, student_id)
       VALUES ($1, $2, $3)
       RETURNING ${ASSIGNMENT_COLUMNS}`,
      [req.params.id, groupId, studentId]
    );
    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'That parameter is already assigned there.' });
    }
    if (err.code === FK_VIOLATION) {
      return res.status(400).json({ error: 'The group or student does not exist.' });
    }
    throw err;
  }
});

router.delete('/:id/assignments/:assignmentId', async (req, res) => {
  if (!isUuid(req.params.assignmentId)) {
    return res.status(404).json({ error: 'Assignment not found.' });
  }
  const result = await pool.query(
    'DELETE FROM parameter_assignments WHERE id = $1 AND parameter_id = $2',
    [req.params.assignmentId, req.params.id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Assignment not found.' });
  }
  res.status(204).end();
});

export default router;
