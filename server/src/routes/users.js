import { Router } from 'express';
import pool from '../db/pool.js';
import { recordAudit } from '../lib/audit.js';
import { isUuid } from '../lib/ids.js';
import { generatePassword, hashPassword } from '../lib/passwords.js';
import { checkUserChange } from '../lib/userRules.js';
import { USER_COLUMNS, createUser } from '../lib/users.js';
import { parseNewUser, parseUserUpdate } from '../validation/user.js';

const router = Router();
const UNIQUE_VIOLATION = '23505';

router.param('id', (req, res, next, value) => {
  if (!isUuid(value)) {
    return res.status(404).json({ error: 'User not found.' });
  }
  next();
});

router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT ${USER_COLUMNS}
     FROM users
     ORDER BY is_active DESC, lower(username)`
  );
  res.json({ users: result.rows });
});

router.post('/', async (req, res) => {
  const parsed = parseNewUser(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const temporaryPassword = generatePassword();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await createUser({
      ...parsed.values,
      password: temporaryPassword,
      mustChangePassword: true,
      db: client,
    });
    await recordAudit(client, {
      userId: req.user.id,
      actor: req.user.username,
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      details: {
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    });
    await client.query('COMMIT');
    res.status(201).json({ user, temporaryPassword });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'That username already exists.' });
    }
    throw err;
  } finally {
    client.release();
  }
});

router.patch('/:id', async (req, res) => {
  const parsed = parseUserUpdate(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT id FROM users WHERE role = 'admin' AND is_active ORDER BY id FOR UPDATE`
    );

    const targetResult = await client.query(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (targetResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found.' });
    }
    const target = targetResult.rows[0];

    const counted = await client.query(
      `SELECT count(*)::int AS count FROM users WHERE role = 'admin' AND is_active`
    );
    const problem = checkUserChange({
      actorId: req.user.id,
      target,
      changes: parsed.values,
      activeAdminCount: counted.rows[0].count,
    });
    if (problem) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: problem });
    }

    const columns = {
      fullName: 'full_name',
      role: 'role',
      isActive: 'is_active',
    };
    const entries = Object.entries(parsed.values);
    const assignments = entries.map(
      ([key], index) => `${columns[key]} = $${index + 1}`
    );
    const values = entries.map(([, value]) => value);

    const updated = await client.query(
      `UPDATE users
       SET ${assignments.join(', ')}, updated_at = now()
       WHERE id = $${values.length + 1}
       RETURNING ${USER_COLUMNS}`,
      [...values, req.params.id]
    );
    const user = updated.rows[0];

    const changes = {};
    for (const key of Object.keys(parsed.values)) {
      if (target[key] !== user[key]) {
        changes[key] = { from: target[key], to: user[key] };
      }
    }

    if (Object.keys(changes).length > 0) {
      if (changes.isActive && user.isActive === false) {
        await client.query(
          `DELETE FROM user_sessions WHERE (sess->>'userId') = $1`,
          [user.id]
        );
      }
      await recordAudit(client, {
        userId: req.user.id,
        actor: req.user.username,
        action: 'user.update',
        entityType: 'user',
        entityId: user.id,
        details: { username: user.username, changes },
      });
    }

    await client.query('COMMIT');
    res.json({ user });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.post('/:id/reset-password', async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(409).json({
      error: 'Use "Change password" for your own account.',
    });
  }

  const temporaryPassword = generatePassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE users
       SET password_hash = $1, must_change_password = true, updated_at = now()
       WHERE id = $2
       RETURNING ${USER_COLUMNS}`,
      [passwordHash, req.params.id]
    );
    if (updated.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found.' });
    }
    const user = updated.rows[0];

    await client.query(
      `DELETE FROM user_sessions WHERE (sess->>'userId') = $1`,
      [user.id]
    );
    await recordAudit(client, {
      userId: req.user.id,
      actor: req.user.username,
      action: 'user.password_reset',
      entityType: 'user',
      entityId: user.id,
      details: { username: user.username },
    });
    await client.query('COMMIT');
    res.json({ user, temporaryPassword });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

export default router;