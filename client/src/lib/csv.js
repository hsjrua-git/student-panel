const FORMULA_START = /^[=+\-@\t\r]/;

export function csvField(value, delimiter = ',') {
  if (value === null || value === undefined) return '';

  let text;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    text = String(value);
  } else {
    text = String(value);
    if (FORMULA_START.test(text)) text = `'${text}`;
  }

  if (text.includes(delimiter) || /["\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows, { delimiter = ',' } = {}) {
  const lines = rows.map((row) =>
    row.map((value) => csvField(value, delimiter)).join(delimiter)
  );
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}