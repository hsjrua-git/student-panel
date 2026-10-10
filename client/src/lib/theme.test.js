import { describe, it, expect } from 'vitest';
import { normalizeTheme } from './theme.js';

describe('normalizeTheme', () => {
  it('keeps the two supported themes', () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
  });

  it('falls back to dark (the default) for anything unrecognised', () => {
    expect(normalizeTheme('system')).toBe('dark'); // retired option
    expect(normalizeTheme('solarized')).toBe('dark');
    expect(normalizeTheme(null)).toBe('dark');
    expect(normalizeTheme(undefined)).toBe('dark');
  });
});
