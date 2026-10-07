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

      <section>
        <h2>Appearance</h2>
        <fieldset className="pref-group">
          <legend>Theme</legend>
          {THEMES.map((option) => (
            <label key={option.value} className="inline">
              <input
                type="radio"
                name="theme"
                checked={preferences.theme === option.value}
                onChange={() => change({ theme: option.value })}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      </section>

      <section>
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
        <p className="hint">The sort order also applies on the Evaluate page.</p>
      </section>

      <section>
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
            {parametersQuery.isPending && <p>Loading...</p>}
            {parametersQuery.isError && (
              <p className="error">{parametersQuery.error.message}</p>
            )}
            {parametersQuery.data && parametersQuery.data.length === 0 && (
              <p>No parameters yet.</p>
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

      <section>
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

      <section>
        <button type="button" onClick={handleReset} disabled={reset.isPending}>
          Reset all to defaults
        </button>
      </section>
    </main>
  );
}

export default PreferencesPage;