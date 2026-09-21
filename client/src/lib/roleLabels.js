export const ROLE_OPTIONS = [
  { value: 'viewer', label: 'Viewer (read only)' },
  { value: 'staff', label: 'Staff (add students, save scores)' },
  { value: 'admin', label: 'Administrator (everything)' },
];

const SHORT = { viewer: 'Viewer', staff: 'Staff', admin: 'Administrator' };

export function roleLabel(role) {
  return SHORT[role] ?? role;
}