export function formatStudentCode(code) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString();
}