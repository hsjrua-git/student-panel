import { Router } from 'express';
import pool from '../db/pool.js';
import { recordAudit } from '../lib/audit.js';
import { fetchGroupRows, memberCounts, wouldCreateCycle } from '../lib/groups.js';
import { getOperatorName } from '../lib/settings.js';
import { isUuid } from '../lib/ids.js';

// Student groups form a tree of any depth. Standard create/update/delete are
// auto-audited by the middleware; only membership changes (PUT /:id/members)
// write their own richer entry. Single-operator build: no `created_by`, no
// per-user fields.

const router = Router();

const GROUP_COLUMNS = `
  id,
  name,
  parent_id   AS "parentId",
  sort_order  AS "sortOrder",
  archived_at AS "archivedAt"
`;

function parseName(input) {
  if (typeof input !== 'string') return { error: 'Group name is required.' };
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length < 1 || value.length > 60) {
    return { error: 'Group name must be 1 to 60 characters.' };
  }
  return { value };
}

async function loadGroup(db, id) {
  const result = await db.query(
    `SELECT ${GROUP_COLUMNS} FROM student_groups WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

async function liveChildCount(db, id) {
  const result = await db.query(
    `SELECT count(*)::int AS count FROM student_groups
     WHERE parent_id = $1 AND archived_at IS NULL`,
    [id]
  );
  return result.rows[0].count;
}

router.param('id', (req, res, next, value) => {
  if (!isUuid(value)) {
    return res.status(404).json({ error: 'Group not found.' });
  }
  next();
});

// List groups. With ?studentId=<uuid>, returns the groups that student is a
// direct member of (live groups only). Otherwise returns every group with a
// direct-member count; ?includeArchived=1 includes archived groups.
router.get('/', async (req, res) => {
  const { studentId } = req.query;
  if (studentId !== undefined) {
    if (!isUuid(studentId)) {
      return res.status(400).json({ error: 'studentId must be a valid ID.' });
    }
    const result = await pool.query(
      `SELECT ${GROUP_COLUMNS}
         FROM student_groups g
         JOIN student_group_members m ON m.group_id = g.id
        WHERE m.student_id = $1 AND g.archived_at IS NULL
        ORDER BY g.sort_order, lower(g.name)`,
      [studentId]
    );
    return res.json({ groups: result.rows });
  }

  const includeArchived = req.query.includeArchived === '1';
  const result = await pool.query(
    `SELECT ${GROUP_COLUMNS},
            COALESCE(mc.count, 0) AS "memberCount"
       FROM student_groups g
       LEFT JOIN (
         SELECT m.group_id, count(*)::int AS count
           FROM student_group_members m
           JOIN students s ON s.id = m.student_id AND s.deleted_at IS NULL
          GROUP BY m.group_id
       ) mc ON mc.group_id = g.id
      WHERE ($1 OR g.archived_at IS NULL)
      ORDER BY g.sort_order, lower(g.name)`,
    [includeArchived]
  );
  res.json({ groups: result.rows });
});

// A single group with its direct-member count.
router.get('/:id', async (req, res) => {
  const group = await loadGroup(pool, req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found.' });
  const counts = await memberCounts(pool);
  res.json({ ...group, memberCount: counts.get(group.id) ?? 0 });
});

router.post('/', async (req, res) => {
  const name = parseName(req.body?.name);
  if (name.error) return res.status(400).json({ error: name.error });

  let parentId = null;
  if (req.body?.parentId != null && req.body.parentId !== '') {
    if (!isUuid(req.body.parentId)) {
      return res.status(400).json({ error: 'Choose a valid parent group.' });
    }
    parentId = req.body.parentId;
    const parent = await loadGroup(pool, parentId);
    if (!parent || parent.archivedAt) {
      return res.status(400).json({ error: 'That parent group does not exist.' });
    }
  }

  const inserted = await pool.query(
    `INSERT INTO student_groups (name, parent_id, sort_order)
     VALUES ($1, $2, (SELECT COALESCE(max(sort_order), 0) + 1 FROM student_groups))
     RETURNING ${GROUP_COLUMNS}`,
    [name.value, parentId]
  );
  res.status(201).json({ ...inserted.rows[0], memberCount: 0 });
});

router.patch('/:id', async (req, res) => {
  const body = req.body ?? {};
  const existing = await loadGroup(pool, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Group not found.' });

  const sets = [];
  const values = [];

  if ('name' in body) {
    const name = parseName(body.name);
    if (name.error) return res.status(400).json({ error: name.error });
    values.push(name.value);
    sets.push(`name = $${values.length}`);
  }

  if ('parentId' in body) {
    let parentId = null;
    if (body.parentId != null && body.parentId !== '') {
      if (!isUuid(body.parentId)) {
        return res.status(400).json({ error: 'Choose a valid parent group.' });
      }
      parentId = body.parentId;
      const parent = await loadGroup(pool, parentId);
      if (!parent || parent.archivedAt) {
        return res.status(400).json({ error: 'That parent group does not exist.' });
      }
      const rows = await fetchGroupRows(pool, { includeArchived: true });
      if (wouldCreateCycle(rows, req.params.id, parentId)) {
        return res.status(400).json({ error: 'A group cannot be moved inside itself.' });
      }
    }
    values.push(parentId);
    sets.push(`parent_id = $${values.length}`);
  }

  if ('sortOrder' in body) {
    if (!Number.isInteger(body.sortOrder)) {
      return res.status(400).json({ error: 'sortOrder must be a whole number.' });
    }
    values.push(body.sortOrder);
    sets.push(`sort_order = $${values.length}`);
  }

  if ('archived' in body) {
    if (typeof body.archived !== 'boolean') {
      return res.status(400).json({ error: 'archived must be true or false.' });
    }
    if (body.archived && (await liveChildCount(pool, req.params.id)) > 0) {
      return res.status(409).json({
        error: 'Archive or move the child groups first.',
      });
    }
    sets.push(`archived_at = ${body.archived ? 'now()' : 'NULL'}`);
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'Nothing to change.' });
  }

  values.push(req.params.id);
  const updated = await pool.query(
    `UPDATE student_groups SET ${sets.join(', ')}
     WHERE id = $${values.length}
     RETURNING ${GROUP_COLUMNS}`,
    values
  );
  const counts = await memberCounts(pool);
  res.json({ ...updated.rows[0], memberCount: counts.get(req.params.id) ?? 0 });
});

// DELETE archives the group (its membership links and evaluations are kept).
router.delete('/:id', async (req, res) => {
  if ((await liveChildCount(pool, req.params.id)) > 0) {
    return res.status(409).json({ error: 'Archive or move the child groups first.' });
  }
  const updated = await pool.query(
    `UPDATE student_groups SET archived_at = now()
     WHERE id = $1 AND archived_at IS NULL
     RETURNING id`,
    [req.params.id]
  );
  if (updated.rowCount === 0) {
    const exists = await pool.query('SELECT 1 FROM student_groups WHERE id = $1', [
      req.params.id,
    ]);
    return exists.rowCount === 0
      ? res.status(404).json({ error: 'Group not found.' })
      : res.status(204).end();
  }
  res.status(204).end();
});

// The direct members of a group.
router.get('/:id/members', async (req, res) => {
  const group = await loadGroup(pool, req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found.' });
  const result = await pool.query(
    `SELECT s.id, s.full_name AS "fullName", s.student_code AS "studentCode"
       FROM student_group_members m
       JOIN students s ON s.id = m.student_id
      WHERE m.group_id = $1 AND s.deleted_at IS NULL
      ORDER BY lower(s.full_name)`,
    [req.params.id]
  );
  res.json({ members: result.rows });
});

// Add and/or remove direct members. Body: { add: [studentId], remove: [studentId] }.
// Self-audited as group.members (skipped by the generic middleware).
router.put('/:id/members', async (req, res) => {
  const group = await loadGroup(pool, req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found.' });

  const add = Array.isArray(req.body?.add) ? req.body.add : [];
  const remove = Array.isArray(req.body?.remove) ? req.body.remove : [];
  for (const id of [...add, ...remove]) {
    if (!isUuid(id)) {
      return res.status(400).json({ error: 'Every student ID must be valid.' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let added = 0;
    let removed = 0;

    if (add.length > 0) {
      // Only add students that actually exist and are not deleted.
      const result = await client.query(
        `INSERT INTO student_group_members (group_id, student_id)
         SELECT $1, s.id FROM students s
          WHERE s.id = ANY($2::uuid[]) AND s.deleted_at IS NULL
         ON CONFLICT (group_id, student_id) DO NOTHING`,
        [req.params.id, add]
      );
      added = result.rowCount;
    }
    if (remove.length > 0) {
      const result = await client.query(
        `DELETE FROM student_group_members
          WHERE group_id = $1 AND student_id = ANY($2::uuid[])`,
        [req.params.id, remove]
      );
      removed = result.rowCount;
    }

    await client.query('COMMIT');

    if (added > 0 || removed > 0) {
      await recordAudit(pool, {
        actor: await getOperatorName(),
        action: 'group.members',
        entityType: 'group',
        entityId: req.params.id,
        details: { added, removed },
      });
    }

    const result = await pool.query(
      `SELECT s.id, s.full_name AS "fullName", s.student_code AS "studentCode"
         FROM student_group_members m
         JOIN students s ON s.id = m.student_id
        WHERE m.group_id = $1 AND s.deleted_at IS NULL
        ORDER BY lower(s.full_name)`,
      [req.params.id]
    );
    res.json({ members: result.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

export default router;
