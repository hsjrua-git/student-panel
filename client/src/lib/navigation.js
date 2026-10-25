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
//
// Sections and items carry stable translation `key`s, not display text: the
// labels live in i18n/{fa,en}/nav.json under `sections.<key>` / `items.<key>`
// (and `titles.<key>` for EXTRA_TITLES) and Layout renders them with t(). The
// keys are language-independent, so anything keyed by them (React keys, the
// open-groups state) stays stable across a language switch.

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
  TeacherIcon,
  CalendarIcon,
  SessionIcon,
  CoffeeIcon,
  CartIcon,
  TruckIcon,
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
  '/teachers': 'teachers.view',
  '/schedule': 'schedule.view',
  '/sessions': 'schedule.view',
  '/cafe': 'cafe.view',
  '/cafe/products': 'cafe.view',
  '/cafe/purchases': 'cafe.supplies',
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
    key: 'overview',
    items: [
      { to: '/dashboard', key: 'dashboard', icon: DashboardIcon },
      { to: '/results', key: 'results', icon: ResultsIcon },
      { to: '/export', key: 'export', icon: DownloadIcon },
    ],
  },
  {
    key: 'teaching',
    items: [
      { to: '/students', key: 'students', icon: StudentsIcon },
      { to: '/evaluate', key: 'evaluate', icon: EvaluateIcon },
      { to: '/teachers', key: 'teachers', icon: TeacherIcon },
      { to: '/schedule', key: 'schedule', icon: CalendarIcon },
      { to: '/sessions', key: 'sessions', icon: SessionIcon },
    ],
  },
  {
    key: 'cafe',
    items: [
      { to: '/cafe', key: 'sales', icon: CartIcon },
      { to: '/cafe/products', key: 'products', icon: CoffeeIcon },
      { to: '/cafe/purchases', key: 'purchases', icon: TruckIcon },
    ],
  },
  {
    key: 'setup',
    items: [
      { to: '/parameters', key: 'parameters', icon: ParametersIcon },
      { to: '/groups', key: 'groups', icon: GroupsIcon },
      { to: '/fields', key: 'fields', icon: FieldsIcon },
      { to: '/settings', key: 'settings', icon: SettingsIcon },
    ],
  },
  {
    key: 'administration',
    items: [
      { to: '/users', key: 'users', icon: UsersIcon },
      { to: '/roles', key: 'roles', icon: RolesIcon },
      { to: '/audit', key: 'audit', icon: AuditIcon },
    ],
  },
];

// Topbar titles for routes that aren't in the sidebar. Values are keys into
// the nav namespace's `titles.*` group (i18n/{fa,en}/nav.json); Layout renders
// them with t().
export const EXTRA_TITLES = {
  '/preferences': 'preferences',
  '/change-password': 'changePassword',
  '/students/import': 'importStudents',
  '/evaluate/import': 'importScores',
};

// Dynamic (parameterised) routes handled the same way: pattern → titles key.
// Checked after EXTRA_TITLES, so /students/import keeps its specific title.
const DYNAMIC_TITLES = [[/^\/students\/[^/]+$/, 'studentDetail']];

// The `titles.*` key for a non-sidebar route, or null when there is none.
export function extraTitleForPath(pathname) {
  if (pathname in EXTRA_TITLES) return EXTRA_TITLES[pathname];
  for (const [pattern, key] of DYNAMIC_TITLES) {
    if (pattern.test(pathname)) return key;
  }
  return null;
}

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
