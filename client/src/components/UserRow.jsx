import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resetUserPassword, updateUser } from '../api/users.js';
import { listRoles } from '../api/roles.js';
import { formatDateTime } from '../lib/format.js';
import { roleLabel } from '../lib/roleLabels.js';

function UserRow({ user, isSelf, onNotice }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(user.fullName);
  const [roleId, setRoleId] = useState(user.roleId);

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: listRoles,
    enabled: isEditing,
  });
  const roles = rolesQuery.data ?? [];

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['users'] });
  }

  const update = useMutation({
    mutationFn: (fields) => updateUser(user.id, fields),
    onSuccess: () => {
      setIsEditing(false);
      refresh();
    },
  });

  const reset = useMutation({
    mutationFn: () => resetUserPassword(user.id),
    onSuccess: (data) => {
      onNotice({
        kind: 'reset',
        username: user.username,
        temporaryPassword: data.temporaryPassword,
      });
      refresh();
    },
  });

  function startEditing() {
    setFullName(user.fullName);
    setRoleId(user.roleId);
    update.reset();
    setIsEditing(true);
  }

  function handleSave() {
    const fields = {};
    if (fullName.trim().replace(/\s+/g, ' ') !== user.fullName) {
      fields.fullName = fullName;
    }
    if (roleId !== user.roleId) fields.roleId = roleId;

    if (Object.keys(fields).length === 0) {
      setIsEditing(false);
      return;
    }
    update.mutate(fields);
  }

  function handleToggleActive() {
    if (user.isActive) {
      const ok = window.confirm(
        `Deactivate ${user.username}? They will be signed out and cannot sign in until you reactivate the account.`
      );
      if (!ok) return;
    }
    update.mutate({ isActive: !user.isActive });
  }

  function handleReset() {
    const ok = window.confirm(
      `Reset the password of ${user.username}? They will be signed out everywhere and must choose a new password at their next sign-in.`
    );
    if (ok) reset.mutate();
  }

  return (
    <tr className={user.isActive ? undefined : 'inactive'}>
      <td>
        {user.username}
        {isSelf && <span className="hint"> (you)</span>}
      </td>
      <td>
        {isEditing ? (
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={100}
            aria-label={`Full name of ${user.username}`}
            autoComplete="off"
          />
        ) : (
          user.fullName
        )}
      </td>
      <td>
        {isEditing ? (
          <select
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            disabled={isSelf}
            aria-label={`Role of ${user.username}`}
          >
            {/* Keep the current role visible even before the list loads. */}
            {roles.length === 0 && (
              <option value={user.roleId}>{user.role}</option>
            )}
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        ) : (
          roleLabel(user.role)
        )}
      </td>
      <td>
        <span className={user.isActive ? 'badge ok' : 'badge'}>
          {user.isActive ? 'Active' : 'Inactive'}
        </span>
        {user.mustChangePassword && (
          <div className="hint">Must change password</div>
        )}
      </td>
      <td className="nowrap">
        {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}
      </td>
      <td className="actions">
        {isEditing ? (
          <>
            <button type="button" onClick={handleSave} disabled={update.isPending}>
              Save
            </button>
            <button type="button" onClick={() => setIsEditing(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={startEditing}>
              Edit
            </button>
            {!isSelf && (
              <>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={reset.isPending}
                >
                  Reset password
                </button>
                <button
                  type="button"
                  className={user.isActive ? 'danger' : undefined}
                  onClick={handleToggleActive}
                  disabled={update.isPending}
                >
                  {user.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
              </>
            )}
          </>
        )}
        {update.isError && <p className="error">{update.error.message}</p>}
        {reset.isError && <p className="error">{reset.error.message}</p>}
      </td>
    </tr>
  );
}

export default UserRow;
