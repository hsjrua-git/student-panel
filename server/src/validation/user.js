import { isUuid } from '../lib/ids.js';

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

export function parseFullName(input) {
  if (typeof input !== 'string') return { error: 'Full name is required.' };
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length < 1 || value.length > 100) {
    return { error: 'Full name must be 1 to 100 characters.' };
  }
  return { value };
}

export function parseNewUser(body) {
  const username = parseUsername(body?.username);
  if (username.error) return { error: username.error };
  const fullName = parseFullName(body?.fullName);
  if (fullName.error) return { error: fullName.error };
  if (!isUuid(body?.roleId)) {
    return { error: 'Choose a role.' };
  }
  return {
    values: {
      username: username.value,
      fullName: fullName.value,
      roleId: body.roleId,
    },
  };
}

export function parseUserUpdate(body) {
  const input = body !== null && typeof body === 'object' ? body : {};
  if ('username' in input) return { error: 'Usernames cannot be changed.' };

  const values = {};
  if ('fullName' in input) {
    const name = parseFullName(input.fullName);
    if (name.error) return { error: name.error };
    values.fullName = name.value;
  }
  if ('roleId' in input) {
    if (!isUuid(input.roleId)) {
      return { error: 'Choose a role.' };
    }
    values.roleId = input.roleId;
  }
  if ('isActive' in input) {
    if (typeof input.isActive !== 'boolean') {
      return { error: 'isActive must be true or false.' };
    }
    values.isActive = input.isActive;
  }

  if (Object.keys(values).length === 0) return { error: 'Nothing to change.' };
  return { values };
}
