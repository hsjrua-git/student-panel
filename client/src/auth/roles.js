const LEVEL = { viewer: 1, staff: 2, admin: 3 };

export function hasAtLeast(role, minRole) {
  return (
    Object.hasOwn(LEVEL, role) &&
    Object.hasOwn(LEVEL, minRole) &&
    LEVEL[role] >= LEVEL[minRole]
  );
}