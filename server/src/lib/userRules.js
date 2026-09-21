export function checkUserChange({ actorId, target, changes, activeAdminCount }) {
  const newRole = changes.role ?? target.role;
  const newActive = changes.isActive ?? target.isActive;

  const roleChanged = newRole !== target.role;
  const deactivating = target.isActive && newActive === false;

  if (target.id === actorId && (roleChanged || deactivating)) {
    return 'You cannot change your own role or deactivate your own account. Ask another administrator.';
  }

  const wasActiveAdmin = target.role === 'admin' && target.isActive;
  const staysActiveAdmin = newRole === 'admin' && newActive;
  if (wasActiveAdmin && !staysActiveAdmin && activeAdminCount <= 1) {
    return 'There must always be at least one active administrator.';
  }
  return null;
}