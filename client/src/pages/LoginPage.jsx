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
      <main className="auth-screen">
        <div className="auth-card">
          <p>Loading...</p>
        </div>
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
    <main className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="auth-brand-name">Student Panel</span>
        </div>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to continue to your panel.</p>
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
      </div>
    </main>
  );
}

export default LoginPage;
