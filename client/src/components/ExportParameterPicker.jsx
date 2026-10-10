import { useMemo, useState } from 'react';

// The "what parameters" selector: all parameters, or a chosen subset. `value`
// is the config.parameters slice ({ mode, ids }); `parameters` is the full list
// (already loaded by the page). Mirrors the Results "Columns" multiselect.
function ExportParameterPicker({ value, parameters, onChange }) {
  const [search, setSearch] = useState('');
  const selecting = value.mode === 'selection';
  const selected = useMemo(() => new Set(value.ids), [value.ids]);

  const needle = search.trim().toLowerCase();
  const shown = needle
    ? parameters.filter((parameter) => parameter.name.toLowerCase().includes(needle))
    : parameters;

  function setMode(mode) {
    onChange({ ...value, mode });
  }

  function toggle(id, on) {
    const ids = on ? [...selected, id] : value.ids.filter((item) => item !== id);
    onChange({ ...value, ids: [...new Set(ids)] });
  }

  return (
    <fieldset className="export-fieldset">
      <legend>Parameters</legend>
      <div className="radio-row">
        <label className="inline">
          <input
            type="radio"
            name="parameter-mode"
            checked={value.mode === 'all'}
            onChange={() => setMode('all')}
          />
          All parameters
        </label>
        <label className="inline">
          <input
            type="radio"
            name="parameter-mode"
            checked={value.mode === 'selection'}
            onChange={() => setMode('selection')}
          />
          Pick parameters
        </label>
      </div>

      {selecting && (
        <div className="export-picker">
          {parameters.length > 8 && (
            <input
              type="search"
              className="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search parameters"
              aria-label="Search parameters"
            />
          )}
          <p className="hint">
            {value.ids.length} selected
            {value.ids.length > 0 && (
              <>
                {' · '}
                <button
                  type="button"
                  className="quiet"
                  onClick={() => onChange({ ...value, ids: [] })}
                >
                  Clear
                </button>
              </>
            )}
          </p>
          <div className="columns-list scroll-list">
            {shown.map((parameter) => (
              <label key={parameter.id} className="inline">
                <input
                  type="checkbox"
                  checked={selected.has(parameter.id)}
                  onChange={(event) => toggle(parameter.id, event.target.checked)}
                />
                {parameter.name}
              </label>
            ))}
            {shown.length === 0 && <p className="hint">No parameters match.</p>}
          </div>
        </div>
      )}
    </fieldset>
  );
}

export default ExportParameterPicker;
