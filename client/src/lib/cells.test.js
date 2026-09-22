import { describe, it, expect } from 'vitest';
import {
  buildEntries,
  buildSavePayload,
  cellAccess,
  cellKey,
  lockedDraftKeys,
  parseCell,
  savedText,
} from './cells.js';

const scored = { minValue: 0, maxValue: 10 };
const open = { minValue: null, maxValue: null };

describe('cellKey / savedText', () => {
  it('joins ids with a colon', () => {
    expect(cellKey('s1', 'p1')).toBe('s1:p1');
  });

  it('renders null/undefined as an empty string, numbers as text', () => {
    expect(savedText(null)).toBe('');
    expect(savedText(undefined)).toBe('');
    expect(savedText(0)).toBe('0');
    expect(savedText(7.5)).toBe('7.5');
  });
});

describe('parseCell', () => {
  it('treats blank as a cleared value', () => {
    expect(parseCell('   ', open)).toEqual({ value: null });
  });

  it('accepts a comma as the decimal separator', () => {
    expect(parseCell('7,5', open)).toEqual({ value: 7.5 });
  });

  it('rejects non-numbers', () => {
    expect(parseCell('abc', open).error).toBeTruthy();
  });

  it('enforces the parameter min and max', () => {
    expect(parseCell('-1', scored).error).toMatch(/at least/i);
    expect(parseCell('11', scored).error).toMatch(/at most/i);
    expect(parseCell('10', scored)).toEqual({ value: 10 });
  });
});

describe('buildEntries', () => {
  const params = new Map([['p1', scored]]);

  it('collects valid entries and reports errors by key', () => {
    const { entries, errors } = buildEntries(
      { 's1:p1': '8', 's2:p1': '99' },
      params,
    );
    expect(entries).toEqual([{ studentId: 's1', parameterId: 'p1', value: 8 }]);
    expect(errors['s2:p1']).toMatch(/at most/i);
  });

  it('skips drafts whose parameter is unknown', () => {
    const { entries, errors } = buildEntries({ 's1:ghost': '5' }, params);
    expect(entries).toEqual([]);
    expect(errors).toEqual({});
  });
});

describe('cellAccess', () => {
  it('is open with no lock or an unlocked lock', () => {
    expect(cellAccess(null, false)).toBe('open');
    expect(cellAccess({ isLocked: false }, false)).toBe('open');
  });

  it('is override for locked cells only when the user can override', () => {
    expect(cellAccess({ isLocked: true }, true)).toBe('override');
    expect(cellAccess({ isLocked: true }, false)).toBe('locked');
  });
});

describe('lockedDraftKeys', () => {
  it('returns edited keys (value or note) that point at a locked cell', () => {
    const locks = { 'a:p': { isLocked: true }, 'b:p': { isLocked: false } };
    const keys = lockedDraftKeys({ 'a:p': '5' }, { 'b:p': 'note' }, locks);
    expect(keys).toEqual(['a:p']);
  });
});

describe('buildSavePayload', () => {
  const params = new Map([['p1', scored]]);

  it('sends a value-only edit without a comment field', () => {
    const { entries } = buildSavePayload({
      drafts: { 's1:p1': '8' },
      noteDrafts: {},
      savedValues: {},
      parametersById: params,
    });
    expect(entries).toEqual([{ studentId: 's1', parameterId: 'p1', value: 8 }]);
    expect('comment' in entries[0]).toBe(false);
  });

  it('re-sends the saved value for a note-only edit so the row is not cleared', () => {
    const { entries } = buildSavePayload({
      drafts: {},
      noteDrafts: { 's1:p1': 'absent' },
      savedValues: { 's1:p1': 6 },
      parametersById: params,
    });
    expect(entries).toEqual([
      { studentId: 's1', parameterId: 'p1', value: 6, comment: 'absent' },
    ]);
  });

  it('turns a blank note into an explicit null (clear the note)', () => {
    const { entries } = buildSavePayload({
      drafts: { 's1:p1': '4' },
      noteDrafts: { 's1:p1': '   ' },
      savedValues: {},
      parametersById: params,
    });
    expect(entries[0].comment).toBe(null);
  });

  it('reports a parse error and drops that entry', () => {
    const { entries, errors } = buildSavePayload({
      drafts: { 's1:p1': 'oops' },
      noteDrafts: {},
      savedValues: {},
      parametersById: params,
    });
    expect(entries).toEqual([]);
    expect(errors['s1:p1']).toBeTruthy();
  });
});
