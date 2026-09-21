import { formatStudentCode } from './format.js';

export const CATEGORY_OPTIONS = [
  { value: '', label: 'Everything' },
  { value: 'scores', label: 'Scores' },
  { value: 'student', label: 'Students' },
  { value: 'parameter', label: 'Parameters' },
  { value: 'parameter_change', label: 'Parameter changes' },
  { value: 'settings', label: 'Settings' },
  { value: 'user', label: 'Users' },
  { value: 'auth', label: 'Sign-in and passwords' },
  { value: 'api', label: 'Other changes' },
];

function withCode(code) {
  return code ? ` (${formatStudentCode(code)})` : '';
}

export function describeAudit(entry) {
  const details = entry.details ?? {};
  const result = details.result ?? {};
  const request = details.request ?? {};

  switch (entry.action) {
    case 'student.create':
      return `Added student ${result.fullName ?? request.fullName ?? ''}${withCode(result.studentCode)}`.trim();
    case 'student.update':
      return `Renamed student to ${result.fullName ?? request.fullName ?? '?'}${withCode(result.studentCode)}`;
    case 'student.delete':
      return entry.studentName
        ? `Deleted student ${entry.studentName}${withCode(entry.studentCode)}`
        : 'Deleted a student';
    case 'parameter.create':
      return `Added parameter ${result.name ?? request.name ?? '?'}, used from Period ${request.startPeriod ?? '?'} on`;
    case 'parameter.update':
      return `Edited parameter ${entry.parameterName ?? result.name ?? 'a parameter'}`;
    case 'parameter_change.create': {
      const name = entry.changeParameterName ?? 'a parameter';
      const verb = result.action === 'add' ? 'Added' : 'Removed';
      const where =
        result.scope === 'this_period_only'
          ? 'for this period only'
          : 'from this period on';
      return `${verb} ${name} ${where}, Period ${result.periodNumber ?? '?'}`;
    }
    case 'parameter_change.delete':
      return 'Undid a parameter change';
    case 'settings.period_anchor':
      return `Set the period start date to ${result.anchorDate ?? request.anchorDate ?? '?'}`;
    case 'scores.save': {
      const count = details.count ?? 0;
      const base = `Saved ${count} score${count === 1 ? '' : 's'} in Period ${details.periodNumber ?? '?'}`;
      return details.overrideReason
        ? `${base}, including locked scores changed with an override: "${details.overrideReason}"`
        : base;
    }
    case 'auth.login':
      return 'Signed in';
    case 'auth.login_failed':
      return `Failed sign-in attempt for "${details.attemptedUsername ?? '?'}"`;
    case 'auth.logout':
      return 'Signed out';
    case 'auth.password_change':
      return 'Changed their password';
    case 'api.change':
      return `${details.method ?? ''} ${details.path ?? ''}`.trim();
    case 'user.create':
      return `Created ${details.role ?? ''} account "${details.username ?? '?'}" (${details.fullName ?? ''})`;
    case 'user.update': {
      const changes = details.changes ?? {};
      const parts = [];
      if (changes.role) parts.push(`role ${changes.role.from} → ${changes.role.to}`);
      if (changes.isActive) {
        parts.push(changes.isActive.to ? 'reactivated' : 'deactivated');
      }
      if (changes.fullName) parts.push(`renamed to ${changes.fullName.to}`);
      return `Updated user "${details.username ?? '?'}": ${parts.join(', ') || 'no changes'}`;
    }
    case 'user.password_reset':
      return `Reset the password of "${details.username ?? '?'}"`;
    default:
      return entry.action;
  }
}