import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';

function RequireAuth() {
  const { user, isLoading, loadError } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <main>
        <p>Loading...</p>
      </main>
    );
  }
  if (loadError) {
    return (
      <main>
        <p className="error">{loadError.message}</p>
      </main>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

export default RequireAuth;