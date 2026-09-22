import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';

const MIN_LENGTH = 10;

function ChangePasswordPage() {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [problem, setProblem] = useState(null);

  function handleSubmit(event) {
    event.preventDefault();

    if (newPassword.length < MIN_LENGTH) {
      changePassword.reset();
      setProblem(`The new password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (newPassword !== repeat) {
      changePassword.reset();
      setProblem('The two new passwords do not match.');
      return;
    }

    setProblem(null);
    const wasForced = user.mustChangePassword;
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword('');
          setNewPassword('');
          setRepeat('');
          if (wasForced) navigate('/students', { replace: true });
        },
      }
    );
  }

  return (
    <main className="narrow">
      <h1>Change password</h1>
      {user.mustChangePassword && (
        <p>You are using a temporary password. Choose a new one to continue.</p>
      )}
      <form onSubmit={handleSubmit} className="edit-form">
        <label>
          Current password
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label>
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label>
          Repeat new password
          <input
            type="password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            autoComplete="new-password"
          />
        </label>
        <button type="submit" disabled={changePassword.isPending}>
          {changePassword.isPending ? 'Saving...' : 'Change password'}
        </button>
        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
        {changePassword.isError && (
          <p className="error" role="alert">
            {changePassword.error.message}
          </p>
        )}
        {changePassword.isSuccess && !user.mustChangePassword && (
          <p className="success" role="status">
            Password changed. Your other sessions were signed out.
          </p>
        )}
      </form>
      <p className="hint">
        Use at least {MIN_LENGTH} characters. Several random words work well.
      </p>
    </main>
  );
}

export default ChangePasswordPage;