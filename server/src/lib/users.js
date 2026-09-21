import pool from '../db/pool.js';
import { hashPassword } from './passwords.js';

export const USER_COLUMNS = `
  id,
  username,
  full_name            AS "fullName",
  role,
  is_active            AS "isActive",
  must_change_password AS "mustChangePassword",
  last_login_at        AS "lastLoginAt",
  created_at           AS "createdAt"
`;

export async function createUser({
  username,
  fullName,
  role,
  password,
  mustChangePassword = true,
  db = pool,
}) {
  const result = await db.query(
    `INSERT INTO users (username, full_name, role, password_hash, must_change_password)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${USER_COLUMNS}`,
    [username, fullName, role, await hashPassword(password), mustChangePassword]
  );
  return result.rows[0];
}