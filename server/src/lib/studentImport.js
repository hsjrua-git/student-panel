import {
  normalizeBirthdate,
  normalizeFullName,
  normalizeGender,
} from '../validation/student.js';

export const MAX_IMPORT_ROWS = 500;

export function nameKey(name) {
  return name.normalize('NFC').toLowerCase();
}

export function validateImportBody(body) {
  const input =
    body !== null && typeof body === 'object' && !Array.isArray(body)
      ? body
      : null;
  if (input === null) return { error: 'Send an object with a list of rows.' };

  const { rows, allowDuplicateNames = false, dryRun = false } = input;
  if (typeof allowDuplicateNames !== 'boolean' || typeof dryRun !== 'boolean') {
    return { error: 'allowDuplicateNames and dryRun must be true or false.' };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: 'rows must be a non-empty list.' };
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return { error: `Import at most ${MAX_IMPORT_ROWS} rows at a time.` };
  }

  const cleaned = [];
  const seenRows = new Set();
  for (const item of rows) {
    const valid =
      item !== null &&
      typeof item === 'object' &&
      Number.isInteger(item.row) &&
      item.row >= 1 &&
      item.row <= 1_000_000 &&
      typeof item.fullName === 'string';
    if (!valid) {
      return { error: 'Every row needs a row number and a fullName.' };
    }
    if (seenRows.has(item.row)) {
      return { error: 'Row numbers must be unique.' };
    }
    seenRows.add(item.row);
    cleaned.push({
      row: item.row,
      fullName: item.fullName,
      // birthdate/gender are optional in the payload but must resolve to valid
      // values for a row to import (both are NOT NULL in the DB).
      birthdate: typeof item.birthdate === 'string' ? item.birthdate : '',
      gender: typeof item.gender === 'string' ? item.gender : '',
    });
  }
  return { rows: cleaned, allowDuplicateNames, dryRun };
}

export function classifyImportRows({ rows, existing, allowDuplicateNames }) {
  const firstSeen = new Map();

  return rows.map(({ row, fullName, birthdate, gender }) => {
    const parsedName = normalizeFullName(fullName);
    const parsedBirthdate = normalizeBirthdate(birthdate);
    const parsedGender = normalizeGender(gender);
    const problem = parsedName.error || parsedBirthdate.error || parsedGender.error;
    if (problem) {
      return {
        row,
        fullName: typeof fullName === 'string' ? fullName.trim() : '',
        birthdate: typeof birthdate === 'string' ? birthdate.trim() : '',
        gender: typeof gender === 'string' ? gender.trim() : '',
        status: 'invalid',
        message: problem,
        existingCode: null,
        willImport: false,
      };
    }

    const name = parsedName.value;
    const key = nameKey(name);
    let status = 'ok';
    let message = '';
    let existingCode = null;

    if (existing.has(key)) {
      status = 'duplicate_existing';
      existingCode = existing.get(key);
      message = 'A student with this name already exists.';
    } else if (firstSeen.has(key)) {
      status = 'duplicate_in_file';
      message = `Same name as row ${firstSeen.get(key)}.`;
    }
    if (!firstSeen.has(key)) firstSeen.set(key, row);

    return {
      row,
      fullName: name,
      birthdate: parsedBirthdate.value,
      gender: parsedGender.value,
      status,
      message,
      existingCode,
      willImport: status === 'ok' || allowDuplicateNames,
    };
  });
}

export function importCounts(classified) {
  const counts = {
    total: classified.length,
    willImport: 0,
    invalid: 0,
    duplicates: 0,
    skipped: 0,
  };
  for (const item of classified) {
    if (item.status === 'invalid') counts.invalid++;
    if (item.status.startsWith('duplicate')) counts.duplicates++;
    if (item.willImport) counts.willImport++;
    else counts.skipped++;
  }
  return counts;
}
