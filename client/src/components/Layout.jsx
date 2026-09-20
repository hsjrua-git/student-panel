import { NavLink, Outlet } from 'react-router';

function Layout() {
  return (
    <>
      <header className="topbar">
        <nav>
          <NavLink to="/students">Students</NavLink>
          <NavLink to="/evaluate">Evaluate</NavLink>
          <NavLink to="/parameters">Parameters</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </header>
      <Outlet />
    </>
  );
}

export default Layout;