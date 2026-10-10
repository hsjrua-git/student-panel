import { useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';

// The sign-in screen. Single-operator: on first run (no password set yet) it
// shows a "create your password" setup form; afterwards, a password-only login.
function LoginPage() {
  const { authed, initialized, isLoading, login, setup } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [operatorName, setOperatorName] = useState('');

  if (isLoading) {
    return (
      <main className="auth-screen">
        <div className="auth-card">
          <p>Loading…</p>
        </div>
      </main>
    );
  }
  if (authed) {
    // `replace` keeps /login out of history, so Back won't bounce here.
    return <Navigate to="/dashboard" replace />;
  }

  const isSetup = !initialized;
  const mutation = isSetup ? setup : login;

  function handleSubmit(event) {
    event.preventDefault();
    if (isSetup) {
      if (password !== confirm) return;
      setup.mutate({ password, operatorName });
    } else {
      login.mutate({ password });
    }
  }

  const mismatch = isSetup && confirm.length > 0 && password !== confirm;

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="auth-brand-name">Student Panel</span>
        </div>
        <h1 className="auth-title">{isSetup ? 'Welcome' : 'Welcome back'}</h1>
        <p className="auth-subtitle">
          {isSetup
            ? 'Set a password to protect your panel. You can change it later.'
            : 'Enter your password to continue.'}
        </p>
        <form onSubmit={handleSubmit} className="edit-form">
          {isSetup && (
            <label>
              Your name <span className="field-hint">(optional)</span>
              <input
                value={operatorName}
                onChange={(event) => setOperatorName(event.target.value)}
                autoComplete="name"
                placeholder="operator"
                maxLength={60}
              />
            </label>
          )}
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isSetup ? 'new-password' : 'current-password'}
              autoFocus={!isSetup}
            />
          </label>
          {isSetup && (
            <label>
              Confirm password
              <input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
              />
            </label>
          )}
          <button
            type="submit"
            disabled={mutation.isPending || mismatch || password.length === 0}
          >
            {mutation.isPending
              ? isSetup
                ? 'Setting up…'
                : 'Signing in…'
              : isSetup
                ? 'Create password'
                : 'Sign in'}
          </button>
          {mismatch && (
            <p className="error" role="alert">
              The passwords don't match.
            </p>
          )}
          {mutation.isError && (
            <p className="error" role="alert">
              {mutation.error.message}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}

export default LoginPage;
