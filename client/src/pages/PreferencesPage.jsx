import { useQuery } from '@tanstack/react-query';
import { listParameters } from '../api/parameters.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { toggleHidden } from '../lib/prefs.js';
import { usePreferences } from '../preferences/PreferencesContext.jsx';

const THEMES = [
  { value: 'system', label: 'Match my device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
const PALETTES = [
  {
    value: 'aurora',
    label: 'Aurora',
    preview: {
      paper: '#f4f5f7',
      surface: '#ffffff',
      line: '#e6e8ec',
      spine: '#16181d',
      brand: '#cf4c0d',
    },
  },
  {
    value: 'gradebook',
    label: 'Gradebook',
    preview: {
      paper: '#f4f5fb',
      surface: '#ffffff',
      line: '#e2e5f0',
      spine: '#141b2e',
      brand: '#4f46e5',
    },
  },
  {
    value: 'midnight',
    label: 'Midnight',
    preview: {
      paper: '#eef2fb',
      surface: '#ffffff',
      line: '#dae2f2',
      spine: '#0e1730',
      brand: '#2563eb',
    },
  },
  {
    value: 'ember',
    label: 'Ember',
    preview: {
      paper: '#faf6f1',
      surface: '#fffdfb',
      line: '#ece1d4',
      spine: '#1f1a15',
      brand: '#c2410c',
    },
  },
  {
    value: 'meadow',
    label: 'Meadow',
    preview: {
      paper: '#f2f8f4',
      surface: '#ffffff',
      line: '#dbeae1',
      spine: '#0e241b',
      brand: '#047857',
    },
  },
  {
    value: 'cobalt',
    label: 'Cobalt',
    preview: {
      paper: '#f4f5f7',
      surface: '#ffffff',
      line: '#e6e8ec',
      spine: '#16181d',
      brand: '#1d6fe0',
    },
  },
  {
    value: 'crimson',
    label: 'Crimson',
    preview: {
      paper: '#f4f5f7',
      surface: '#ffffff',
      line: '#e6e8ec',
      spine: '#0b0b0d',
      brand: '#d21f3c',
    },
  },
];
const PAGE_SIZES = [10, 25, 50, 100];
const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name (A to Z)' },
  { value: 'code', label: 'Student code' },
];
const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'period', label: 'By period' },
  { value: 'parameter', label: 'By parameter' },
];

function PreferencesPage() {
  const { preferences, update, reset } = usePreferences();
  const { can } = useAuth();
  // The "hide parameters from the overview" control only makes sense for a role
  // that can actually see parameters; without parameters.view the query would
  // 403. Gate both the fetch and the section on the permission.
  const canViewParameters = can('parameters.view');
  const canEnterScores = can('scores.enter');
  const canExport = can('data.export');
  const parametersQuery = useQuery({
    queryKey: ['parameters'],
    queryFn: listParameters,
    enabled: canViewParameters,
  });

  function change(changes) {
    update.mutate(changes);
  }

  function handleReset() {
    if (window.confirm('Reset all your preferences to the defaults?')) {
      reset.mutate();
    }
  }

  let status = null;
  if (update.isPending || reset.isPending) {
    status = <span>Saving...</span>;
  } else if (update.isError) {
    status = (
      <span className="error" role="alert">
        Could not save: {update.error.message}
      </span>
    );
  } else if (reset.isError) {
    status = (
      <span className="error" role="alert">
        Could not reset: {reset.error.message}
      </span>
    );
  } else if (update.isSuccess || reset.isSuccess) {
    status = (
      <span className="success" role="status">
        Saved.
      </span>
    );
  }

  return (
    <main>
      <h1>Preferences</h1>
      <p className="hint">
        These settings are yours alone, and follow you to any computer. Changes
        are saved as soon as you make them.
      </p>
      <p role="status" className="status-line">
        {status}
      </p>

      <section className="section-card">
        <h2>Appearance</h2>
        <p className="hint">
          Choose light or dark, then pick a palette that recolors the whole app.
        </p>
        <fieldset className="pref-group">
          <legend>Theme</legend>
          <div className="segmented" role="radiogroup" aria-label="Theme">
            {THEMES.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="theme"
                  checked={preferences.theme === option.value}
                  onChange={() => change({ theme: option.value })}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="pref-group">
          <legend>Palette</legend>
          <div className="palette-swatches">
            {PALETTES.map((option) => (
              <label key={option.value} className="palette-option">
                <input
                  type="radio"
                  name="palette"
                  checked={(preferences.palette ?? 'aurora') === option.value}
                  onChange={() => change({ palette: option.value })}
                />
                <span
                  className="palette-preview"
                  style={{
                    '--pv-paper': option.preview.paper,
                    '--pv-surface': option.preview.surface,
                    '--pv-line': option.preview.line,
                    '--pv-spine': option.preview.spine,
                    '--pv-brand': option.preview.brand,
                  }}
                  aria-hidden="true"
                >
                  <span className="palette-preview-spine" />
                  <span className="palette-preview-body">
                    <span className="palette-preview-bar" />
                    <span className="palette-preview-bar short" />
                    <span className="palette-preview-dot" />
                  </span>
                </span>
                <span className="palette-name">{option.label}</span>
              </label>
            ))}
          </div>
          <p className="hint">
            Recolors the whole interface — the sidebar, surfaces, and highlight
            color. Each palette has a light and a dark version, so the theme
            setting above still applies.
          </p>
        </fieldset>
      </section>

      <section className="section-card">
        <h2>Students list</h2>
        <div className="pref-group">
          <label className="inline">
            Rows per page
            <select
              value={preferences.studentsPageSize}
              onChange={(event) =>
                change({ studentsPageSize: Number(event.target.value) })
              }
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            Sort by
            <select
              value={preferences.studentsSort}
              onChange={(event) => change({ studentsSort: event.target.value })}
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            <input
              type="checkbox"
              checked={preferences.studentsShowCode}
              onChange={(event) =>
                change({ studentsShowCode: event.target.checked })
              }
            />
            Show the code column
          </label>
          <label className="inline">
            <input
              type="checkbox"
              checked={preferences.studentsShowAdded}
              onChange={(event) =>
                change({ studentsShowAdded: event.target.checked })
              }
            />
            Show the "Added" column
          </label>
        </div>
        {canEnterScores && (
          <p className="hint">The sort order also applies on the Evaluate page.</p>
        )}
      </section>

      <section className="section-card">
        <h2>Student page</h2>
        <div className="pref-group">
          <label className="inline">
            Open on
            <select
              value={preferences.studentDefaultTab}
              onChange={(event) =>
                change({ studentDefaultTab: event.target.value })
              }
            >
              {TABS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            <input
              type="checkbox"
              checked={preferences.studentShowAllPeriods}
              onChange={(event) =>
                change({ studentShowAllPeriods: event.target.checked })
              }
            />
            Show all periods in the overview, not just from the first score
          </label>
        </div>

        {canViewParameters && (
          <>
            <h3>Parameters shown in the overview</h3>
            {parametersQuery.isPending && <p className="hint">Loading…</p>}
            {parametersQuery.isError && (
              <p className="error">{parametersQuery.error.message}</p>
            )}
            {parametersQuery.data && parametersQuery.data.length === 0 && (
              <p className="hint">No parameters yet.</p>
            )}
            <div className="pref-group">
              {parametersQuery.data?.map((parameter) => (
                <label key={parameter.id} className="inline">
                  <input
                    type="checkbox"
                    checked={!preferences.hiddenParameterIds.includes(parameter.id)}
                    onChange={(event) =>
                      change({
                        hiddenParameterIds: toggleHidden(
                          preferences.hiddenParameterIds,
                          parameter.id,
                          event.target.checked
                        ),
                      })
                    }
                  />
                  {parameter.name}
                </label>
              ))}
            </div>
            <p className="hint">
              Hidden parameters still appear in the "By period" and "By parameter"
              views.
            </p>
          </>
        )}
      </section>

      {canExport && (
        <section className="section-card">
          <h2>Spreadsheet export</h2>
          <div className="pref-group">
            <label className="inline">
              Separator between columns
              <select
                value={preferences.csvDelimiter}
                onChange={(event) => change({ csvDelimiter: event.target.value })}
              >
                <option value=",">Comma ( , )</option>
                <option value=";">Semicolon ( ; )</option>
              </select>
            </label>
          </div>
          <p className="hint">
            If your spreadsheet opens an export with everything in one column,
            switch to the other separator. Programs set up for regions that
            write decimals with commas usually expect semicolons.
          </p>
        </section>
      )}

      <section className="section-card">
        <h2>Reset preferences</h2>
        <p className="hint">
          Put every preference above back to its default. This only affects your
          own settings.
        </p>
        <button type="button" onClick={handleReset} disabled={reset.isPending}>
          Reset all to defaults
        </button>
      </section>
    </main>
  );
}

export default PreferencesPage;