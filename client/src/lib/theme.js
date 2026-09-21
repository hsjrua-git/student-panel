const STORAGE_KEY = 'studentPanelTheme';
const THEMES = ['system', 'light', 'dark'];

export function normalizeTheme(value) {
  return THEMES.includes(value) ? value : 'system';
}

export function applyTheme(theme) {
  const value = normalizeTheme(theme);
  document.documentElement.dataset.theme = value;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // storage may be unavailable; the theme still applies for this visit
  }
}

export function applyRememberedTheme() {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  document.documentElement.dataset.theme = normalizeTheme(stored);
}