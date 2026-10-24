import { isValidIsoDate } from '../lib/periods.js';
import { normalizeFullName } from './student.js';

// Intervals are described structurally ({ everyDays } or { everyMonths }) and
// converted to a Postgres interval string here — a raw interval string from
// the client is never trusted.
export function parseIntervalBody(body, { partial = false } = {}) {
  const updates = {};

  if (!partial || 'name' in body) {
    if (typeof body?.name !== 'string') {
      return { error: 'Interval name is required.' };
    }
    const name = body.name.trim().replace(/\s+/g, ' ');
    if (name.length < 1 || name.length > 60) {
      return { error: 'Interval name must be 1 to 60 characters.' };
    }
    updates.name = name;
  }

  if (!partial || 'everyDays' in body || 'everyMonths' in body) {
    const days = body?.everyDays;
    const months = body?.everyMonths;
    if (Number.isInteger(months) && months >= 1 && months <= 24) {
      updates.every = `${months} month${months === 1 ? '' : 's'}`;
    } else if (Number.isInteger(days) && days >= 1 && days <= 365) {
      updates.every = `${days} day${days === 1 ? '' : 's'}`;
    } else {
      return {
        error: 'Interval length must be 1-365 days or 1-24 months.',
      };
    }
  }

  if ('sortOrder' in body) {
    const sort = body.sortOrder;
    if (!Number.isInteger(sort) || sort < 0) {
      return { error: 'Sort order must be a whole number from 0.' };
    }
    updates.sortOrder = sort;
  }

  if (Object.keys(updates).length === 0) {
    return { error: 'Nothing to change.' };
  }
  return { value: updates };
}

function requiredIsoDate(input, label) {
  if (typeof input !== 'string' || !isValidIsoDate(input)) {
    return { error: `${label} must be a valid date (YYYY-MM-DD).` };
  }
  return { value: input };
}

// Tasks and task templates share their title/description rules.
export function parseTaskFields(body, { partial = false } = {}) {
  const updates = {};

  if (!partial || 'title' in body) {
    if (typeof body?.title !== 'string') {
      return { error: 'Title is required.' };
    }
    const title = body.title.trim().replace(/\s+/g, ' ');
    if (title.length < 1 || title.length > 120) {
      return { error: 'Title must be 1 to 120 characters.' };
    }
    updates.title = title;
  }

  if ('description' in body) {
    const description = body?.description;
    if (description !== undefined && description !== null && description !== '') {
      if (typeof description !== 'string' || description.length > 2000) {
        return { error: 'Description must be 2000 characters or fewer.' };
      }
      const trimmed = description.trim();
      updates.description = trimmed === '' ? null : trimmed;
    } else {
      updates.description = null;
    }
  }

  if ('sortOrder' in body) {
    if (!Number.isInteger(body.sortOrder) || body.sortOrder < 0) {
      return { error: 'Sort order must be a whole number from 0.' };
    }
    updates.sortOrder = body.sortOrder;
  }

  return { value: updates };
}

// An assignment targets a group (groupId) or exactly one membership
// (membershipId); teacherId + intervalId + anchorDate are always required.
// The code may be blank (auto-generated); the name is optional.
export function parseAssignmentBody(body, { partial = false } = {}) {
  const updates = {};

  if (!partial || 'teacherId' in body) {
    if (typeof body?.teacherId !== 'string') {
      return { error: 'Choose a teacher.' };
    }
    updates.teacherId = body.teacherId;
  }

  if (!partial || 'intervalId' in body) {
    if (typeof body?.intervalId !== 'string') {
      return { error: 'Choose an interval.' };
    }
    updates.intervalId = body.intervalId;
  }

  if (!partial || 'anchorDate' in body) {
    const anchor = requiredIsoDate(body?.anchorDate, 'The anchor date');
    if (anchor.error) return anchor;
    updates.anchorDate = anchor.value;
  }

  if (!partial || 'name' in body) {
    const raw = body?.name;
    if (raw === undefined || raw === null || raw === '') {
      updates.name = null;
    } else {
      const name = normalizeFullName(raw);
      if (name.error) {
        return { error: 'Assignment name must be 2 to 100 characters.' };
      }
      updates.name = name.value;
    }
  }

  if (!partial || 'code' in body) {
    if (body?.code === undefined || body?.code === null || String(body.code).trim() === '') {
      if (!partial) updates.code = null; // auto-generate
    } else {
      const code = String(body.code).trim();
      if (code.length < 1 || code.length > 40) {
        return { error: 'Assignment code must be 1 to 40 characters.' };
      }
      updates.code = code;
    }
  }

  // Target: exactly one of groupId / membershipId, present on create; on a
  // partial update either key may appear (switching targets is allowed).
  if (!partial) {
    const hasGroup = typeof body?.groupId === 'string';
    const hasMember = typeof body?.membershipId === 'string';
    if (hasGroup === hasMember) {
      return {
        error: 'Choose exactly one target: a group or a single student.',
      };
    }
    if (hasGroup) updates.groupId = body.groupId;
    else updates.membershipId = body.membershipId;
  } else {
    if ('groupId' in body) updates.groupId = body.groupId ?? null;
    if ('membershipId' in body) updates.membershipId = body.membershipId ?? null;
    if ('groupId' in body && 'membershipId' in body) {
      const hasGroup = updates.groupId !== null;
      const hasMember = updates.membershipId !== null;
      if (hasGroup === hasMember) {
        return {
          error: 'Choose exactly one target: a group or a single student.',
        };
      }
    }
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
