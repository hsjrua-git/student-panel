import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { NAV_SECTIONS, ROUTE_PERMISSIONS } from '../lib/navigation.js';
import {
  ChevronsLeftIcon,
  LockIcon,
  PreferencesIcon,
  SignOutIcon,
} from './icons.jsx';
import PageLoader from './PageLoader.jsx';

// Titles shown in the header for routes that aren't in the sidebar.
const EXTRA_TITLES = {
  '/preferences': 'Preferences',
  '/change-password': 'Change password',
};

function Layout() {
  const { user, can, logout } = useAuth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Desktop-only: collapse the labelled rail down to a slim icon-only strip.
  // Session-local React state (like openGroups): a layout convenience that
  // resets at logout and never leaks between users on a shared machine.
  // Starts collapsed at every login — Layout unmounts on logout, so this
  // default re-applies each time a user signs in (ref 5's slim-rail default).
  const [navCollapsed, setNavCollapsed] = useState(true);
  // Which nav groups are expanded. Starts empty (all folded) at every login.
  // Layout stays mounted while navigating between pages, so an expanded group
  // stays expanded across the session; logging out unmounts Layout, which
  // resets this back to folded. Kept in React state (not browser storage) so it
  // never leaks between users on a shared machine.
  const [openGroups, setOpenGroups] = useState({});
  const sidebarRef = useRef(null);
  const toggleRef = useRef(null);

  // Close the mobile drawer on navigation so it never lingers over the page.
  // React's endorsed alternative to an effect: adjust state during render when
  // a value it derives from (the path) changes, guarded so it runs only once.
  const [lastPath, setLastPath] = useState(location.pathname);
  if (location.pathname !== lastPath) {
    setLastPath(location.pathname);
    setDrawerOpen(false);
  }

  // Track whether we're at the width where the sidebar becomes an overlay
  // drawer (matches the max-width: 880px breakpoint in index.css). This drives
  // the keyboard behaviour below: a focus trap and `inert` only make sense
  // while the sidebar is a floating drawer, never when it's the fixed rail.
  useEffect(() => {
    const query = window.matchMedia('(max-width: 880px)');
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // When the drawer opens on mobile, move focus into it and keep focus trapped
  // there until it closes; Escape closes it and returns focus to the toggle.
  // Off-screen (drawer closed on mobile) the sidebar is `inert`, so its links
  // are neither tabbable nor announced — see the aside below.
  useEffect(() => {
    if (!isMobile || !drawerOpen) return undefined;
    const sidebar = sidebarRef.current;
    if (!sidebar) return undefined;

    const focusable = () =>
      sidebar.querySelectorAll(
        'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      );

    focusable()[0]?.focus();

    function handleKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDrawerOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isMobile, drawerOpen]);

  const showNav = !user.mustChangePassword;

  // Only render a section (and its items) the user is actually allowed to see.
  // The permission for each item comes from ROUTE_PERMISSIONS (null = any
  // signed-in user), the same map the route guard uses — so a hidden link is
  // always also a blocked page.
  const sections = showNav
    ? NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          const permission = ROUTE_PERMISSIONS[item.to];
          return !permission || can(permission);
        }),
      })).filter((section) => section.items.length > 0)
    : [];

  const currentTitle = titleForPath(location.pathname, sections);

  // The icon-only rail is a desktop affordance; on mobile the sidebar is a
  // full-width overlay drawer, so collapsing never applies there. It also only
  // applies once the nav is showing — on the forced change-password screen
  // (showNav false) the rail stays expanded so the pinned account actions keep
  // their labels and Change password stays reachable.
  const railCollapsed = showNav && !isMobile && navCollapsed;

  return (
    <div
      className={`app-shell${drawerOpen ? ' drawer-open' : ''}${
        railCollapsed ? ' nav-collapsed' : ''
      }`}
    >
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <aside
        className="sidebar"
        id="primary-navigation"
        aria-label="Primary"
        ref={sidebarRef}
        inert={isMobile && !drawerOpen}
      >
        <div className="sidebar-top">
          {showNav && (
            <button
              type="button"
              className="rail-toggle"
              aria-label={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-pressed={navCollapsed}
              aria-controls="primary-navigation"
              onClick={() => setNavCollapsed((collapsed) => !collapsed)}
            >
              <ChevronsLeftIcon className="rail-toggle-icon" size={18} />
            </button>
          )}
          <span className="brand-name">Student Panel</span>
        </div>
        {showNav && (
          <nav className="sidebar-nav">
            {sections.map((section) => (
              <details
                className="nav-group"
                open={railCollapsed || Boolean(openGroups[section.title])}
                onToggle={(event) => {
                  // While collapsed the rail forces every group open so all
                  // icons show; don't record that transient state — the user's
                  // real expand/fold choices are preserved for when they expand
                  // the rail again.
                  if (railCollapsed) return;
                  // Read the element's open state NOW, while the event is still
                  // live. React releases the synthetic event once this handler
                  // returns and nulls out currentTarget, so reading it inside
                  // the setState updater below (which runs later, during render)
                  // would throw "Cannot read properties of null (reading
                  // 'open')". Capture the boolean first, then use that.
                  const isOpen = event.currentTarget.open;
                  setOpenGroups((current) => {
                    if (Boolean(current[section.title]) === isOpen) return current;
                    return { ...current, [section.title]: isOpen };
                  });
                }}
                key={section.title}
              >
                <summary className="nav-group-head">
                  <span>{section.title}</span>
                  <svg className="chevron" viewBox="0 0 12 12" aria-hidden="true">
                    <path
                      d="M2.5 4.5 6 8l3.5-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </summary>
                <div className="nav-group-items">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className="nav-link"
                        title={railCollapsed ? item.label : undefined}
                      >
                        {Icon && (
                          <span className="nav-icon" aria-hidden="true">
                            <Icon size={18} />
                          </span>
                        )}
                        <span className="nav-label">{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </details>
            ))}
          </nav>
        )}

        {/* Personal actions pinned at the foot of the rail (ref 5): who's signed
            in, then Preferences / Change password / Sign out. Preferences and
            Sign out stay visible in both the expanded and collapsed rail; Change
            password rides along only when there's room for its label. This is
            the app's single home for these actions — there is no separate topbar
            account menu. */}
        <div className="sidebar-account">
          <div
            className="sidebar-account-id"
            title={railCollapsed ? `${user.fullName} · ${user.role}` : undefined}
          >
            <span className="avatar" aria-hidden="true">
              {initialsOf(user.fullName)}
            </span>
            <span className="sidebar-account-meta">
              <span className="account-name">{user.fullName}</span>
              <span className="account-role">{user.role}</span>
            </span>
          </div>
          <div className="sidebar-account-actions">
            <NavLink
              to="/preferences"
              className="nav-link"
              title={railCollapsed ? 'Preferences' : undefined}
            >
              <span className="nav-icon" aria-hidden="true">
                <PreferencesIcon size={18} />
              </span>
              <span className="nav-label">Preferences</span>
            </NavLink>
            <NavLink to="/change-password" className="nav-link account-collapsed-hide">
              <span className="nav-icon" aria-hidden="true">
                <LockIcon size={18} />
              </span>
              <span className="nav-label">Change password</span>
            </NavLink>
            <button
              type="button"
              className="nav-link account-signout"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              title={railCollapsed ? 'Sign out' : undefined}
            >
              <span className="nav-icon" aria-hidden="true">
                <SignOutIcon size={18} />
              </span>
              <span className="nav-label">
                {logout.isPending ? 'Signing out…' : 'Sign out'}
              </span>
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop only matters on small screens, where the sidebar floats over
          the page; tapping it dismisses the drawer. */}
      <button
        type="button"
        className="drawer-backdrop"
        aria-label="Close menu"
        tabIndex={drawerOpen ? 0 : -1}
        onClick={() => {
          setDrawerOpen(false);
          // Return focus to the toggle rather than losing it on the now-hidden
          // backdrop (mirrors the Escape behaviour).
          toggleRef.current?.focus();
        }}
      />

      <div className="app-main">
        <header className="app-topbar">
          {showNav && (
            <button
              type="button"
              className="nav-toggle"
              ref={toggleRef}
              aria-label="Toggle menu"
              aria-expanded={drawerOpen}
              aria-controls="primary-navigation"
              onClick={() => setDrawerOpen((open) => !open)}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M3 5h14M3 10h14M3 15h14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
          <span className="topbar-title" key={currentTitle}>
            {currentTitle}
          </span>
        </header>

        {/* The skip-link jumps here; tabIndex=-1 lets this container take focus
            so keyboard users land past the nav. Suspense shows PageLoader while
            a lazily-loaded page chunk (see App.jsx) downloads. */}
        <div id="main-content" tabIndex={-1}>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

// Up to two initials for the account chip's avatar: first + last word of the
// full name, falling back to the first character (or "?" for an empty name).
function initialsOf(fullName) {
  const parts = String(fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function titleForPath(pathname, sections) {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.to === pathname) return item.label;
    }
  }
  if (EXTRA_TITLES[pathname]) return EXTRA_TITLES[pathname];
  // Nested routes like /students/:id or /students/import: fall back to the
  // nearest top-level label so the header still reads sensibly.
  const top = '/' + pathname.split('/').filter(Boolean)[0];
  for (const section of sections) {
    for (const item of section.items) {
      if (item.to === top) return item.label;
    }
  }
  return 'Student Panel';
}

export default Layout;
