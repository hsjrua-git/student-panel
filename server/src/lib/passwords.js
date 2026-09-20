import { randomInt } from 'node:crypto';
import argon2 from 'argon2';

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

const ALPHABET =
  '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';

export function hashPassword(password) {
  return argon2.hash(password);
}

export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function generatePassword(length = 16) {
  let password = '';
  for (let i = 0; i < length; i++) {
    password += ALPHABET[randomInt(ALPHABET.length)];
  }
  return password;
}

export function validateNewPassword(password, { username } = {}) {
  if (typeof password !== 'string') return 'A new password is required.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `The password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  if (username && password.toLowerCase() === username.toLowerCase()) {
    return 'The password cannot be the same as the username.';
  }
  return null;
}