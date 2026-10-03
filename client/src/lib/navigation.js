// Single source of truth for which permission each route needs, plus the
// grouped sidebar. Three things read from here — the sidebar (Layout), the
// client-side route guard (RequirePermission), and the post-login landing
// (firstAllowedPath) — so a role, INCLUDING any new one an admin builds out of
// permission keys, automatically gets a menu, page access, and a landing spot
// that match exactly what it is allowed to do, with no per-route wiring.
//
// A permission of `null` means "any signed-in user" (Preferences, Change
// password). The server still enforces every permission on the API; this map
// only decides what the client shows and lets you navigate to — the API remains
// the real gate.

import {
  DashboardIcon,
  ResultsIcon,
  StudentsIcon,
  EvaluateIcon,
  ParametersIcon,
  GroupsIcon,
  FieldsIcon,
  SettingsIcon,
  UsersIcon,
  RolesIcon,
  AuditIcon,
  DownloadIcon,
} from '../components/icons.jsx';

export const ROUTE_PERMISSIONS = {
  '/dashboard': 'dashboard.view',
  '/results': 'scores.view',
  '/export': 'data.export',
  '/students': 'students.view',
  '/students/import': 'data.import',
  '/evaluate': 'scores.enter',
  '/evaluate/import': 'data.import',
  '/parameters': 'parameters.manage',
  '/groups': 'groups.manage',
  '/fields': 'fields.manage',
  '/settings': 'settings.manage',
  '/users': 'users.manage',
  '/roles': 'roles.manage',
  '/audit': 'audit.view',
  '/preferences': null,
  '/change-password': null,
};

// The grouped sidebar. Each item's required permission is looked up from
// ROUTE_PERMISSIONS above (by its `to` path), so the menu and the route guard
// can never drift apart.
export const NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
      { to: '/results', label: 'Results', icon: ResultsIcon },
      { to: '/export', label: 'Export', icon: DownloadIcon },
    ],
  },
  {
    title: 'Teaching',
    items: [
      { to: '/students', label: 'Students', icon: StudentsIcon },
      { to: '/evaluate', label: 'Evaluate', icon: EvaluateIcon },
    ],
  },
  {
    title: 'Setup',
    items: [
      { to: '/parameters', label: 'Parameters', icon: ParametersIcon },
      { to: '/groups', label: 'Groups', icon: GroupsIcon },
      { to: '/fields', label: 'Fields', icon: FieldsIcon },
      { to: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/users', label: 'Users', icon: UsersIcon },
      { to: '/roles', label: 'Roles', icon: RolesIcon },
      { to: '/audit', label: 'Audit log', icon: AuditIcon },
    ],
  },
];

// The permission a path needs, or `null` for "any signed-in user". Nested paths
// that aren't listed explicitly (e.g. the student detail page /students/:id)
// fall back to their top-level section's rule (/students → students.view).
export function permissionForPath(pathname) {
  if (pathname in ROUTE_PERMISSIONS) return ROUTE_PERMISSIONS[pathname];
  const top = '/' + pathname.split('/').filter(Boolean)[0];
  if (top in ROUTE_PERMISSIONS) return ROUTE_PERMISSIONS[top];
  return null;
}

// The first place a freshly signed-in user is allowed to see. Prefers the
// dashboard (the app's home) when they can view it, otherwise walks the sidebar
// in order and picks the first item they can reach, and finally falls back to
// Preferences — which every signed-in user can open — so there is ALWAYS a
// valid landing spot, even for a role stripped down to almost nothing.
export function firstAllowedPath(can) {
  if (can('dashboard.view')) return '/dashboard';
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      const permission = ROUTE_PERMISSIONS[item.to];
      if (!permission || can(permission)) return item.to;
    }
  }
  return '/preferences';
}
