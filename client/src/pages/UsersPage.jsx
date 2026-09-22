import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listUsers } from '../api/users.js';
import { useAuth } from '../auth/AuthContext.jsx';
import TemporaryPasswordNotice from '../components/TemporaryPasswordNotice.jsx';
import UserForm from '../components/UserForm.jsx';
import UserRow from '../components/UserRow.jsx';

function UsersPage() {
  const { user: me, can } = useAuth();
  const [notice, setNotice] = useState(null);

  const query = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
    enabled: can('users.manage'),
  });

  if (!can('users.manage')) {
    return (
      <main>
        <h1>Users</h1>
        <p>You do not have permission to manage users.</p>
      </main>
    );
  }

  return (
    <main className="wide">
      <h1>Users</h1>
      <p className="hint">
        Accounts are never deleted, only deactivated, so the history stays
        accurate. You cannot change your own role or deactivate yourself.
      </p>

      {notice && (
        <TemporaryPasswordNotice
          notice={notice}
          onDismiss={() => setNotice(null)}
        />
      )}

      <section>
        <h2>Add a user</h2>
        <UserForm onNotice={setNotice} />
      </section>

      <section>
        <h2>All users</h2>
        {query.isPending && <p>Loading...</p>}
        {query.isError && <p className="error">{query.error.message}</p>}
        {query.data && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Full name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last sign-in</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isSelf={user.id === me.id}
                    onNotice={setNotice}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export default UsersPage;