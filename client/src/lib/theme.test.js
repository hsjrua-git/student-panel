import { describe, it, expect } from 'vitest';
import { normalizeTheme } from './theme.js';

describe('normalizeTheme', () => {
  it('keeps the three supported themes', () => {
    expect(normalizeTheme('system')).toBe('system');
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
  });

  it('falls back to system for anything unrecognised', () => {
    expect(normalizeTheme('solarized')).toBe('system');
    expect(normalizeTheme(null)).toBe('system');
    expect(normalizeTheme(undefined)).toBe('system');
  });
});
