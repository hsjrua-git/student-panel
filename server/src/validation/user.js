const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export function parseUsername(input) {
  if (typeof input !== 'string') return { error: 'Username is required.' };
  const value = input.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(value)) {
    return {
      error:
        'Username must be 3 to 32 characters: letters, digits, dots, dashes or underscores.',
    };
  }
  return { value };
}