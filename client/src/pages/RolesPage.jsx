import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  createRole,
  deleteRole,
  fetchPermissionCatalog,
  listRoles,
  updateRole,
} from '../api/roles.js';

// The built-in Administrator is the one system role that can manage roles.
// It is locked everywhere (no edit, rename, or delete) so an installation can
// never strip its own last set of admin powers. Other system roles (Staff,
// Viewer) stay fully editable.
function isAdminRole(role) {
  return role.isSystem && role.permissions.includes('roles.manage');
}

// Expand a chosen set to include every prerequisite (transitively).
function addWithPrerequisites(keys, key, prerequisites) {
  const next = new Set(keys);
  const visit = (k) => {
    if (next.has(k)) return;
    next.add(k);
    for (const need of prerequisites[k] ?? []) visit(need);
  };
  visit(key);
  return next;
}

// Remove a key and anything that depends on it (transitively).
function removeWithDependents(keys, key, prerequisites) {
  const next = new Set(keys);
  const dependsOn = (candidate, target, seen = new Set()) => {
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    return (prerequisites[candidate] ?? []).some(
      (need) => need === target || dependsOn(need, target, seen)
    );
  };
  next.delete(key);
  for (const other of [...next]) {
    if (dependsOn(other, key)) next.delete(other);
  }
  return next;
}

function PermissionEditor({ catalog, selected, onToggle, disabled }) {
  const groups = useMemo(() => {
    const byGroup = new Map();
    for (const permission of catalog.permissions) {
      if (!byGroup.has(permission.group)) byGroup.set(permission.group, []);
      byGroup.get(permission.group).push(permission);
    }
    return [...byGroup.entries()];
  }, [catalog]);

  return (
    <div className="permission-grid">
      {groups.map(([group, permissions]) => (
        <fieldset key={group}>
          <legend>{group}</legend>
          {permissions.map((permission) => (
            <label key={permission.key} className="checkbox-row">
              <input
                type="checkbox"
                checked={selected.has(permission.key)}
                disabled={disabled}
                onChange={(event) =>
                  onToggle(permission.key, event.target.checked)
                }
              />
              <span>{permission.label}</span>
              <code className="hint">{permission.key}</code>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

function RoleEditor({ catalog, role, onDone }) {
  const queryClient = useQueryClient();
  const isNew = role === null;
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState(
    () => new Set(role?.permissions ?? [])
  );

  const save = useMutation({
    mutationFn: (payload) =>
      isNew ? createRole(payload) : updateRole(role.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      onDone();
    },
  });

  function toggle(key, checked) {
    setSelected((current) =>
      checked
        ? addWithPrerequisites(current, key, catalog.prerequisites)
        : removeWithDependents(current, key, catalog.prerequisites)
    );
  }

  function handleSubmit(event) {
    event.preventDefault();
    save.mutate({
      name,
      description,
      permissions: [...selected],
    });
  }

  return (
    <form onSubmit={handleSubmit} className="role-editor">
      <div className="form-grid">
        <label>
          Role name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={50}
            autoComplete="off"
          />
        </label>
        <label>
          Description
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={200}
            autoComplete="off"
          />
        </label>
      </div>

      {role?.isSystem && (
        <p className="hint">
          {isAdminRole(role)
            ? 'This is the built-in Administrator role and cannot be changed.'
            : 'This is a built-in role. You can rename it and adjust its permissions, but it cannot be deleted.'}
        </p>
      )}

      <PermissionEditor
        catalog={catalog}
        selected={selected}
        onToggle={toggle}
      />

      <div className="toolbar">
        <button type="submit" disabled={save.isPending || name.trim() === ''}>
          {save.isPending ? 'Saving…' : isNew ? 'Create role' : 'Save changes'}
        </button>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
      {save.isError && (
        <p className="error" role="alert">
          {save.error.message}
        </p>
      )}
    </form>
  );
}

function RolesPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null); // role object, or 'new', or null

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: listRoles });
  const catalogQuery = useQuery({
    queryKey: ['role-catalog'],
    queryFn: fetchPermissionCatalog,
  });

  const remove = useMutation({
    mutationFn: (id) => deleteRole(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });

  if (!can('roles.manage')) {
    return (
      <main>
        <h1>Roles</h1>
        <p>You do not have permission to manage roles.</p>
      </main>
    );
  }

  if (rolesQuery.isPending || catalogQuery.isPending) {
    return (
      <main>
        <h1>Roles</h1>
        <p>Loading…</p>
      </main>
    );
  }
  if (rolesQuery.isError) {
    return (
      <main>
        <h1>Roles</h1>
        <p className="error">{rolesQuery.error.message}</p>
      </main>
    );
  }

  const catalog = catalogQuery.data;

  function handleDelete(role) {
    if (
      window.confirm(
        `Delete the "${role.name}" role? This cannot be undone.`
      )
    ) {
      remove.mutate(role.id);
    }
  }

  return (
    <main className="wide">
      <h1>Roles</h1>
      <p className="hint">
        A role is a named set of permissions. Give people the role that matches
        what they should be able to do. Ticking a permission automatically ticks
        anything it depends on.
      </p>

      {editing === null ? (
        <>
          <p>
            <button type="button" onClick={() => setEditing('new')}>
              New role
            </button>
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Description</th>
                  <th>Permissions</th>
                  <th>People</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rolesQuery.data.map((role) => (
                  <tr key={role.id}>
                    <td>
                      {role.name}
                      {role.isSystem && (
                        <span className="hint"> (built-in)</span>
                      )}
                    </td>
                    <td>{role.description || '—'}</td>
                    <td>{role.permissions.length}</td>
                    <td>{role.userCount}</td>
                    <td className="actions">
                      {isAdminRole(role) ? (
                        <span className="hint">Locked</span>
                      ) : (
                        <>
                          <button type="button" onClick={() => setEditing(role)}>
                            Edit
                          </button>
                          {!role.isSystem && (
                            <button
                              type="button"
                              onClick={() => handleDelete(role)}
                              disabled={role.userCount > 0 || remove.isPending}
                              title={
                                role.userCount > 0
                                  ? 'Move its people to another role first'
                                  : undefined
                              }
                            >
                              Delete
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {remove.isError && (
            <p className="error" role="alert">
              {remove.error.message}
            </p>
          )}
        </>
      ) : (
        <section>
          <h2>{editing === 'new' ? 'New role' : `Edit ${editing.name}`}</h2>
          <RoleEditor
            catalog={catalog}
            role={editing === 'new' ? null : editing}
            onDone={() => setEditing(null)}
          />
        </section>
      )}
    </main>
  );
}

export default RolesPage;
