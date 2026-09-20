import pool from '../db/pool.js';
import { ROLES, isRole } from '../lib/roles.js';
import { generatePassword } from '../lib/passwords.js';
import { createUser } from '../lib/users.js';
import { parseUsername } from '../validation/user.js';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [rawUsername, rawFullName, role = 'admin'] = process.argv.slice(2);

const username = parseUsername(rawUsername);
if (username.error) fail(username.error);

const fullName = (rawFullName ?? '').trim();
if (fullName.length < 1 || fullName.length > 100) {
  fail('Give a full name of 1 to 100 characters, in quotes.');
}
if (!isRole(role)) fail(`Role must be one of: ${ROLES.join(', ')}.`);

const password = generatePassword();
try {
  await createUser({
    username: username.value,
    fullName,
    role,
    password,
    mustChangePassword: true,
  });
} catch (err) {
  if (err.code === '23505') fail('That username already exists.');
  throw err;
}

console.log(`Created ${role} "${username.value}".`);
console.log(`Temporary password (shown once): ${password}`);
console.log('The user must choose a new password at first login.');
await pool.end();