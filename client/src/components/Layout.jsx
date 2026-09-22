import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';

function Layout() {
  const { user, can, logout } = useAuth();

  return (
    <>
      <header className="topbar">
        <nav>
          {!user.mustChangePassword && (
            <>
              <NavLink to="/students">Students</NavLink>
              <NavLink to="/results">Results</NavLink>
              {can('staff') && <NavLink to="/evaluate">Evaluate</NavLink>}
              <NavLink to="/parameters">Parameters</NavLink>
              <NavLink to="/settings">Settings</NavLink>
              {can('admin') && <NavLink to="/audit">Audit log</NavLink>}
              {can('admin') && <NavLink to="/users">Users</NavLink>}
            </>
          )}
        </nav>
        <div className="account">
          <span>
            {user.fullName} ({user.role})
          </span>
          <NavLink to="/preferences">Preferences</NavLink>
          <NavLink to="/change-password">Change password</NavLink>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            Sign out
          </button>
        </div>
      </header>
      <Outlet />
    </>
  );
}

export default Layout;