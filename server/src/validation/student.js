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