import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import EmptyState from './EmptyState.jsx';

// Auth gate for every routed page. Single-operator: the session is either signed
// in or not. If not, bounce to /login (which also handles first-run setup).
function RequireAuth() {
  const { authed, isLoading, loadError } = useAuth();
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
  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

export default RequireAuth;
