export function formatStudentCode(code) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString();
}

export function formatIsoDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function describeChange({ scope, action }) {
  const verb = action === 'add' ? 'Added' : 'Removed';
  return scope === 'from_here_on'
    ? `${verb}, from this period on`
    : `${verb}, this period only`;
}

export function formatRange({ minValue, maxValue }) {
  if (minValue === null && maxValue === null) return '—';
  return `${minValue ?? '…'} to ${maxValue ?? '…'}`;
}

export function formatShortIsoDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

export function formatParameterHint(parameter) {
  const range = formatRange(parameter);
  return [range === '—' ? null : range, parameter.unit]
    .filter(Boolean)
    .join(' · ');
}

export function formatChange(change) {
  if (change === null) return '—';
  if (change === 0) return '0';
  return `${change > 0 ? '▲' : '▼'} ${Math.abs(change)}`;
}