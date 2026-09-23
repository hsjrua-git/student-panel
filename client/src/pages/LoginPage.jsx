import { useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { firstAllowedPath } from '../lib/navigation.js';

function LoginPage() {
  const { user, isLoading, login, can } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  if (isLoading) {
    return (
      <main className="narrow">
        <p>Loading...</p>
      </main>
    );
  }
  if (user) {
    // Land on the first page this user's role can actually open (the dashboard
    // when they can see it, otherwise the first permitted menu item). `replace`
    // keeps /login out of history, so Back won't bounce to the sign-in screen.
    return <Navigate to={firstAllowedPath(can)} replace />;
  }

  function handleSubmit(event) {
    event.preventDefault();
    login.mutate({ username, password });
  }

  return (
    <main className="narrow">
      <h1>Sign in</h1>
      <form onSubmit={handleSubmit} className="edit-form">
        <label>
          Username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Signing in...' : 'Sign in'}
        </button>
        {login.isError && (
          <p className="error" role="alert">
            {login.error.message}
          </p>
        )}
      </form>
    </main>
  );
}

export default LoginPage;