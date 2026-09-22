import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';

function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const location = useLocation();
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
    const from = location.state?.from?.pathname ?? '/students';
    return <Navigate to={from} replace />;
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