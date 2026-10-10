// The grouped sidebar for the single-operator panel. There are no users, roles
// or permissions in this build — the session is simply signed in or not — so
// this file is now just the menu: a flat list of sections and their items. The
// Layout renders every item; RequireAuth gates the whole app on `authed`.

import {
  DashboardIcon,
  ResultsIcon,
  StudentsIcon,
  EvaluateIcon,
  TasksIcon,
  ParametersIcon,
  GroupsIcon,
  PeriodsIcon,
  FieldsIcon,
  SettingsIcon,
  AuditIcon,
  DownloadIcon,
} from '../components/icons.jsx';

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
      { to: '/tasks', label: 'Tasks', icon: TasksIcon },
    ],
  },
  {
    title: 'Setup',
    items: [
      { to: '/parameters', label: 'Parameters', icon: ParametersIcon },
      { to: '/groups', label: 'Groups', icon: GroupsIcon },
      { to: '/periods', label: 'Periods', icon: PeriodsIcon },
      { to: '/fields', label: 'Fields', icon: FieldsIcon },
      { to: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
  {
    title: 'History',
    items: [{ to: '/audit', label: 'Audit log', icon: AuditIcon }],
  },
];
