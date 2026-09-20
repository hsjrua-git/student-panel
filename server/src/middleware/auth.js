import pool from '../db/pool.js';
import { hasAtLeast, minRoleFor } from '../lib/roles.js';
import { USER_COLUMNS } from '../lib/users.js';

export async function attachUser(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) return next();

  const result = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 AND is_active`,
    [userId]
  );
  if (result.rowCount === 0) {
    await new Promise((resolve) => req.session.destroy(resolve));
    return next();
  }
  req.user = result.rows[0];
  next();
}

export function requireLogin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Please sign in.' });
  }
  next();
}

export function authorize(policy) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Please sign in.' });
    }
    if (req.user.mustChangePassword) {
      return res.status(403).json({
        error: 'You must change your password first.',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
    const minRole = minRoleFor(policy, req.method);
    if (minRole === null || !hasAtLeast(req.user.role, minRole)) {
      return res
        .status(403)
        .json({ error: 'You do not have permission to do that.' });
    }
    next();
  };
}