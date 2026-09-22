import { Router } from 'express';
import pool from '../db/pool.js';
import { recordAudit } from '../lib/audit.js';
import { descendantGroupIds } from '../lib/groups.js';
import { isUuid } from '../lib/ids.js';

const router = Router();
const UNIQUE_VIOLATION = '23505';

function parseName(input) {
  if (typeof input !== 'string') return { error: 'Group name is required.' };
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length < 1 || value.length > 60) {
    return { error: 'Group name must be 1 to 60 characters.' };
  }
  return { value };
}

router.param('id', (req, res, next, value) => {
  if (!isUuid(value)) {
    return res.status(404).json({ error: 'Group not found.' });
  }
  next();
});

router.get('/', async (req, res) => {
  const { studentId } = req.query;
  const includeArchived = req.query.includeArchived === '1';

  if (studentId !== undefined) {
    if (!isUuid(studentId)) {
      return res.status(400).json({ error: 'studentId must be a valid ID.' });
    }
    const result = await pool.query(
      `SELECT g.id, g.name, g.parent_id AS "parentId"
       FROM student_groups g
       JOIN student_group_members m ON m.group_id = g.id
       WHERE m.student_id = $1 AND g.archived_at IS NULL
       ORDER BY lower(g.name)`,
      [studentId]
    );
    return res.json({ groups: result.rows });
  }

  const result = await pool.query(
    `SELECT g.id,
            g.name,
            g.parent_id  AS "parentId",
            g.archived_at AS "archivedAt",
            (SELECT count(*)::int FROM student_group_members m
             WHERE m.group_id = g.id) AS "memberCount"
     FROM student_groups g
     WHERE $1 OR g.archived_at IS NULL
     ORDER BY lower(g.name)`,
    [includeArchived]
  );
  res.json({ groups: result.rows });
});

async function loadGroup(db, id) {
  const result = await db.query(
    `SELECT id, name, parent_id AS "parentId", archived_at AS "archivedAt"
     FROM student_groups WHERE id = $1`,
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

router.post('/', async (req, res) => {
  const name = parseName(req.body?.name);
  if (name.error) return res.status(400).json({ error: name.error });

  const parentId = req.body?.parentId ?? null;
  if (parentId !== null && !isUuid(parentId)) {
    return res.status(400).json({ error: 'Choose a valid parent group.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (parentId !== null) {
      const parent = await loadGroup(client, parentId);
      if (!parent || parent.archivedAt) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'That parent group does not exist.' });
      }
    }
    const inserted = await client.query(
      `INSERT INTO student_groups (name, parent_id, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, name, parent_id AS "parentId", archived_at AS "archivedAt"`,
      [name.value, parentId, req.user.id]
    );
    const group = inserted.rows[0];
    await recordAudit(client, {
      userId: req.user.id,
      actor: req.user.username,
      action: 'group.create',
      entityType: 'group',
      entityId: group.id,
      details: { name: group.name, parentId },
    });
    await client.query('COMMIT');
    res.status(201).json({ group: { ...group, memberCount: 0 } });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === UNIQUE_VIOLATION) {
      return res
        .status(409)
        .json({ error: 'A group with that name already exists here.' });
    }
    throw err;
  } finally {
    client.release();
  }
});

router.patch('/:id', async (req, res) => {
  const body = req.body ?? {};
  const updates = {};

  if ('name' in body) {
    const name = parseName(body.name);
    if (name.error) return res.status(400).json({ error: name.error });
    updates.name = name.value;
  }
  if ('parentId' in body) {
    if (body.parentId !== null && !isUuid(body.parentId)) {
      return res.status(400).json({ error: 'Choose a valid parent group.' });
    }
    updates.parentId = body.parentId;
  }
  if ('archived' in body) {
    if (typeof body.archived !== 'boolean') {
      return res.status(400).json({ error: 'archived must be true or false.' });
    }
    updates.archived = body.archived;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nothing to change.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const group = await loadGroup(client, req.params.id);
    if (!group) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Group not found.' });
    }

    if ('parentId' in updates && updates.parentId !== group.parentId) {
      if (updates.parentId !== null) {
        const parent = await loadGroup(client, updates.parentId);
        if (!parent || parent.archivedAt) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'That parent group does not exist.' });
        }
        // A group cannot move under itself or any of its own descendants.
        const descendants = await descendantGroupIds(client, group.id);
        if (descendants.includes(updates.parentId)) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: 'A group cannot be moved inside itself or one of its subgroups.',
          });
        }
      }
    }

    if (updates.archived === true && !group.archivedAt) {
      if ((await liveChildCount(client, group.id)) > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Archive or move its subgroups first.',
        });
      }
    }

    const sets = [];
    const values = [];
    if ('name' in updates) {
      values.push(updates.name);
      sets.push(`name = $${values.length}`);
    }
    if ('parentId' in updates) {
      values.push(updates.parentId);
      sets.push(`parent_id = $${values.length}`);
    }
    if ('archived' in updates) {
      sets.push(`archived_at = ${updates.archived ? 'now()' : 'NULL'}`);
    }
    values.push(group.id);
    const updated = await client.query(
      `UPDATE student_groups SET ${sets.join(', ')}
       WHERE id = $${values.length}
       RETURNING id, name, parent_id AS "parentId", archived_at AS "archivedAt"`,
      values
    );

    await recordAudit(client, {
      userId: req.user.id,
      actor: req.user.username,
      action: 'group.update',
      entityType: 'group',
      entityId: group.id,
      details: { name: updated.rows[0].name, changes: updates },
    });
    await client.query('COMMIT');
    res.json({ group: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === UNIQUE_VIOLATION) {
      return res
        .status(409)
        .json({ error: 'A group with that name already exists here.' });
    }
    throw err;
  } finally {
    client.release();
  }
});

// DELETE archives the group (we never hard-delete, to keep history intact).
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const group = await loadGroup(client, req.params.id);
    if (!group) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Group not found.' });
    }
    if (group.archivedAt) {
      await client.query('ROLLBACK');
      return res.status(204).end();
    }
    if ((await liveChildCount(client, group.id)) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Archive or move its subgroups first.' });
    }
    await client.query(
      `UPDATE student_groups SET archived_at = now() WHERE id = $1`,
      [group.id]
    );
    await recordAudit(client, {
      userId: req.user.id,
      actor: req.user.username,
      action: 'group.archive',
      entityType: 'group',
      entityId: group.id,
      details: { name: group.name },
    });
    await client.query('COMMIT');
    res.status(204).end();
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.get('/:id/members', async (req, res) => {
  const group = await loadGroup(pool, req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found.' });
  const result = await pool.query(
    `SELECT s.id,
            s.full_name    AS "fullName",
            s.student_code AS "studentCode"
     FROM student_group_members m
     JOIN students s ON s.id = m.student_id AND s.deleted_at IS NULL
     WHERE m.group_id = $1
     ORDER BY lower(s.full_name)`,
    [req.params.id]
  );
  res.json({ students: result.rows });
});

// PUT is mapped to the groups.assign permission in index.js.
router.put('/:id/members', async (req, res) => {
  const add = Array.isArray(req.body?.add) ? req.body.add : [];
  const remove = Array.isArray(req.body?.remove) ? req.body.remove : [];
  if (![...add, ...remove].every((id) => isUuid(id))) {
    return res.status(400).json({ error: 'Student ids must be valid IDs.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const group = await loadGroup(client, req.params.id);
    if (!group) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Group not found.' });
    }
    if (group.archivedAt) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This group is archived.' });
    }

    let added = 0;
    let removed = 0;
    if (add.length > 0) {
      const result = await client.query(
        `INSERT INTO student_group_members (student_id, group_id)
         SELECT s.id, $1
         FROM students s
         WHERE s.id = ANY($2::uuid[]) AND s.deleted_at IS NULL
         ON CONFLICT DO NOTHING`,
        [group.id, add]
      );
      added = result.rowCount;
    }
    if (remove.length > 0) {
      const result = await client.query(
        `DELETE FROM student_group_members
         WHERE group_id = $1 AND student_id = ANY($2::uuid[])`,
        [group.id, remove]
      );
      removed = result.rowCount;
    }

    if (added > 0 || removed > 0) {
      await recordAudit(client, {
        userId: req.user.id,
        actor: req.user.username,
        action: 'group.members',
        entityType: 'group',
        entityId: group.id,
        details: { name: group.name, added, removed },
      });
    }
    await client.query('COMMIT');
    res.json({ added, removed });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

export default router;
