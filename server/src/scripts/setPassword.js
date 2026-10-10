import pool from '../db/pool.js';
import {
  generatePassword,
  hashPassword,
  validateNewPassword,
} from '../lib/passwords.js';
import { KEYS, setSetting, isInitialized } from '../lib/settings.js';

// Set (or reset) the single login password from the command line, so you can get
// in without the first-run web screen — handy for the Windows launcher or if the
// password is forgotten.
//
//   npm run set-password                       generates a strong password, prints it
//   npm run set-password -- "my passphrase"    sets that password
//   npm run set-password -- "my passphrase" "Jane Doe"   also sets the operator name
//
// Writes the argon2 hash to settings (key 'auth.password_hash') and flips
// 'auth.initialized' on. The plaintext is never stored; a generated one is
// printed once here and nowhere else.

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [, , passwordArg, operatorArg] = process.argv;

let password = passwordArg;
let generated = false;
if (password === undefined) {
  password = generatePassword(16);
  generated = true;
} else {
  const problem = validateNewPassword(password);
  if (problem) fail(problem);
}

const wasInitialized = await isInitialized();

await setSetting(KEYS.passwordHash, await hashPassword(password));
await setSetting(KEYS.initialized, 'true');
if (typeof operatorArg === 'string' && operatorArg.trim()) {
  await setSetting(KEYS.operatorName, operatorArg.trim().slice(0, 60));
}

console.log(wasInitialized ? 'Password updated.' : 'Password set.');
if (generated) {
  console.log(`\n  Generated password:  ${password}\n`);
  console.log('Store it now — it will not be shown again.');
}

await pool.end();
