import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createUser } from '../api/users.js';
import { listRoles } from '../api/roles.js';

function UserForm({ onNotice }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleId, setRoleId] = useState('');

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: listRoles });
  const roles = rolesQuery.data ?? [];

  // The effective selection is the user's explicit pick, or — until they touch
  // the dropdown — the first role in the list. Deriving it during render (rather
  // than defaulting via an effect) avoids an extra render pass and the
  // set-state-in-effect anti-pattern.
  const selectedRoleId = roleId || roles[0]?.id || '';

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: (data) => {
      setUsername('');
      setFullName('');
      setRoleId('');
      onNotice({
        kind: 'created',
        username: data.user.username,
        temporaryPassword: data.temporaryPassword,
      });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    mutation.mutate({ username, fullName, roleId: selectedRoleId });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <label>
          Username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="e.g. tina.t"
            maxLength={32}
            autoComplete="off"
          />
        </label>
        <label>
          Full name
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={100}
            autoComplete="off"
          />
        </label>
        <label>
          Role
          <select
            value={selectedRoleId}
            onChange={(event) => setRoleId(event.target.value)}
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="submit" disabled={mutation.isPending || selectedRoleId === ''}>
        {mutation.isPending ? 'Creating...' : 'Create account'}
      </button>
      {mutation.isError && (
        <p className="error" role="alert">
          {mutation.error.message}
        </p>
      )}
    </form>
  );
}

export default UserForm;
