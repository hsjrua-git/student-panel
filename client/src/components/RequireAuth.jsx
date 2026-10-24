import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import EmptyState from './EmptyState.jsx';

function RequireAuth() {
  const { user, isLoading, loadError } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <main aria-busy="true">
        <div className="page-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Loading…</p>
        </div>
      </main>
    );
  }
  if (loadError) {
    return (
      <main>
        <EmptyState
          tone="danger"
          title="Couldn't load your session"
          description={loadError.message}
        />
      </main>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}

export default RequireAuth;
