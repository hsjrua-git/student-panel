import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createUser } from '../api/users.js';
import { ROLE_OPTIONS } from '../lib/roleLabels.js';

function UserForm({ onNotice }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('staff');

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: (data) => {
      setUsername('');
      setFullName('');
      setRole('staff');
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
    mutation.mutate({ username, fullName, role });
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
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating...' : 'Create account'}
      </button>
      {mutation.isError && <p className="error">{mutation.error.message}</p>}
    </form>
  );
}

export default UserForm;