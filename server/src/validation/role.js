import { isPermissionKey } from '../lib/permissions.js';

export function parseRoleName(input) {
  if (typeof input !== 'string') return { error: 'Role name is required.' };
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length < 1 || value.length > 50) {
    return { error: 'Role name must be 1 to 50 characters.' };
  }
  return { value };
}

export function parseDescription(input) {
  if (input === undefined || input === null) return { value: '' };
  if (typeof input !== 'string') return { error: 'Description must be text.' };
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length > 200) {
    return { error: 'Description must be 200 characters or fewer.' };
  }
  return { value };
}

export function parsePermissions(input) {
  if (!Array.isArray(input)) {
    return { error: 'Permissions must be a list.' };
  }
  const seen = new Set();
  for (const key of input) {
    if (!isPermissionKey(key)) {
      return { error: `Unknown permission: ${String(key)}.` };
    }
    seen.add(key);
  }
  return { value: [...seen] };
}

export function parseNewRole(body) {
  const name = parseRoleName(body?.name);
  if (name.error) return { error: name.error };
  const description = parseDescription(body?.description);
  if (description.error) return { error: description.error };
  const permissions = parsePermissions(body?.permissions ?? []);
  if (permissions.error) return { error: permissions.error };
  return {
    values: {
      name: name.value,
      description: description.value,
      permissions: permissions.value,
    },
  };
}

export function parseRoleUpdate(body) {
  const input = body !== null && typeof body === 'object' ? body : {};
  const values = {};
  if ('name' in input) {
    const name = parseRoleName(input.name);
    if (name.error) return { error: name.error };
    values.name = name.value;
  }
  if ('description' in input) {
    const description = parseDescription(input.description);
    if (description.error) return { error: description.error };
    values.description = description.value;
  }
  if ('permissions' in input) {
    const permissions = parsePermissions(input.permissions);
    if (permissions.error) return { error: permissions.error };
    values.permissions = permissions.value;
  }
  if (Object.keys(values).length === 0) return { error: 'Nothing to change.' };
  return { values };
}
