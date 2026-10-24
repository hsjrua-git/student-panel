import { isValidIsoDate, todayIso } from '../lib/periods.js';

export function normalizeFullName(input) {
  if (typeof input !== 'string') {
    return { error: 'Full name is required.' };
  }
  const name = input.trim().replace(/\s+/g, ' ');
  if (name.length < 2) {
    return { error: 'Full name must be at least 2 characters.' };
  }
  if (name.length > 100) {
    return { error: 'Full name must be 100 characters or fewer.' };
  }
  return { value: name };
}

// The identity fields below are all optional: absent, null and '' mean "not
// set" (stored as NULL). Every normalizer returns { value } or { error }.

export function normalizeGender(input) {
  if (input === undefined || input === null || input === '') return { value: null };
  if (input === 'male' || input === 'female') return { value: input };
  return { error: 'Gender must be "male" or "female".' };
}

export function normalizeBirthDate(input) {
  if (input === undefined || input === null || input === '') return { value: null };
  if (typeof input !== 'string' || !isValidIsoDate(input)) {
    return { error: 'Birth date must be a valid date (YYYY-MM-DD).' };
  }
  if (input > todayIso()) {
    return { error: 'Birth date cannot be in the future.' };
  }
  return { value: input };
}

export function normalizeFatherName(input) {
  if (input === undefined || input === null || input === '') return { value: null };
  if (typeof input !== 'string') {
    return { error: 'Father name must be text.' };
  }
  const name = input.trim().replace(/\s+/g, ' ');
  if (name.length < 2) {
    return { error: 'Father name must be at least 2 characters.' };
  }
  if (name.length > 100) {
    return { error: 'Father name must be 100 characters or fewer.' };
  }
  return { value: name };
}

export function normalizeNationalId(input) {
  if (input === undefined || input === null || input === '') return { value: null };
  if (typeof input !== 'string' || !/^[0-9]{10}$/.test(input)) {
    return { error: 'National ID must be exactly 10 digits.' };
  }
  return { value: input };
}
