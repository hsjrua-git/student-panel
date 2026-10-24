import { isValidIsoDate, todayIso } from '../lib/periods.js';
import { normalizeFullName } from './student.js';

// Teachers carry full identity from the start (unlike students, whose
// identity columns are filled in gradually): both birth date and national ID
// are required.

function requiredBirthDate(input) {
  if (typeof input !== 'string' || !isValidIsoDate(input)) {
    return { error: 'Birth date must be a valid date (YYYY-MM-DD).' };
  }
  if (input > todayIso()) {
    return { error: 'Birth date cannot be in the future.' };
  }
  return { value: input };
}

function requiredNationalId(input) {
  if (typeof input !== 'string' || !/^[0-9]{10}$/.test(input)) {
    return { error: 'National ID must be exactly 10 digits.' };
  }
  return { value: input };
}

// Validate the full teacher record for creation.
export function parseNewTeacher(body) {
  const fullName = normalizeFullName(body?.fullName);
  if (fullName.error) return fullName;
  const birthDate = requiredBirthDate(body?.birthDate);
  if (birthDate.error) return birthDate;
  const nationalId = requiredNationalId(body?.nationalId);
  if (nationalId.error) return nationalId;
  return {
    value: {
      fullName: fullName.value,
      birthDate: birthDate.value,
      nationalId: nationalId.value,
    },
  };
}

// Validate a partial update (each field present in the body).
export function parseTeacherUpdate(body) {
  const updates = {};
  if ('fullName' in body) {
    const fullName = normalizeFullName(body.fullName);
    if (fullName.error) return fullName;
    updates.fullName = fullName.value;
  }
  if ('birthDate' in body) {
    const birthDate = requiredBirthDate(body.birthDate);
    if (birthDate.error) return birthDate;
    updates.birthDate = birthDate.value;
  }
  if ('nationalId' in body) {
    const nationalId = requiredNationalId(body.nationalId);
    if (nationalId.error) return nationalId;
    updates.nationalId = nationalId.value;
  }
  if ('archived' in body) {
    if (typeof body.archived !== 'boolean') {
      return { error: 'archived must be true or false.' };
    }
    updates.archived = body.archived;
  }
  if (Object.keys(updates).length === 0) {
    return { error: 'Nothing to change.' };
  }
  return { value: updates };
}
