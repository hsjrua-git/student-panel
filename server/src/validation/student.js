// Validation + normalisation for student create/update bodies. Full name,
// birthdate and gender are mandatory (migration 003). Custom-field values live
// in `extra` and are validated separately by lib/fields.js.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

// A calendar-real YYYY-MM-DD date within the DB's 1900..2100 CHECK window.
export function normalizeBirthdate(input) {
  if (typeof input !== 'string' || !DATE_PATTERN.test(input.trim())) {
    return { error: 'Birthdate must be a date (YYYY-MM-DD).' };
  }
  const value = input.trim();
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { error: 'Birthdate is not a real calendar date.' };
  }
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2100) {
    return { error: 'Birthdate year must be between 1900 and 2100.' };
  }
  return { value };
}

// Gender is a free-text label (1-40 chars) rather than a fixed enum, so the
// operator can use whatever vocabulary fits their setting.
export function normalizeGender(input) {
  if (typeof input !== 'string') {
    return { error: 'Gender is required.' };
  }
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length < 1) {
    return { error: 'Gender is required.' };
  }
  if (value.length > 40) {
    return { error: 'Gender must be 40 characters or fewer.' };
  }
  return { value };
}
