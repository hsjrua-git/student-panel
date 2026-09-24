const STORAGE_KEY = 'studentPanelTheme';
const PALETTE_KEY = 'studentPanelPalette';
const THEMES = ['system', 'light', 'dark'];
// 'aurora' is the built-in default: it maps to *no* data-palette attribute, so
// the signature indigo/violet glass tokens at the top of index.css apply
// untouched. Every other palette (including the classic 'gradebook' look) sets
// [data-palette] and lets the stylesheet recolor the whole interface.
const PALETTES = ['aurora', 'gradebook', 'midnight', 'ember', 'meadow'];

export function normalizeTheme(value) {
  return THEMES.includes(value) ? value : 'system';
}

export function normalizePalette(value) {
  return PALETTES.includes(value) ? value : 'aurora';
}

function setPaletteAttribute(palette) {
  const value = normalizePalette(palette);
  if (value === 'aurora') {
    delete document.documentElement.dataset.palette;
  } else {
    document.documentElement.dataset.palette = value;
  }
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

export function applyPalette(palette) {
  const value = normalizePalette(palette);
  setPaletteAttribute(value);
  try {
    localStorage.setItem(PALETTE_KEY, value);
  } catch {
    // storage may be unavailable; the palette still applies for this visit
  }
}

// Applied at boot (main.jsx) before preferences load, so the remembered theme
// and palette are painted immediately and there's no flash of the default.
export function applyRememberedTheme() {
  let storedTheme = null;
  let storedPalette = null;
  try {
    storedTheme = localStorage.getItem(STORAGE_KEY);
    storedPalette = localStorage.getItem(PALETTE_KEY);
  } catch {
    // ignore
  }
  document.documentElement.dataset.theme = normalizeTheme(storedTheme);
  setPaletteAttribute(storedPalette);
}
