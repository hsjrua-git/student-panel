import { TABULAR_FORMATS, LAYOUTS } from '../lib/exportConfig.js';

const FORMAT_LABELS = {
  csv: 'CSV (one file per section)',
  json: 'JSON',
  xlsx: 'Excel (.xlsx, one sheet per section)',
};

const LAYOUT_LABELS = {
  wide: 'Wide — one column per parameter',
  long: 'Long — one row per score',
};

// Picks the file format for the tabular content and, for the scores cube, its
// shape. `value` is the whole config (it reads tabularFormat + layout); `onChange`
// receives a partial patch. Layout only matters when scores (data) are included.
function FormatPicker({ format, layout, showLayout, onChange }) {
  return (
    <fieldset className="export-fieldset">
      <legend>Format</legend>
      <label className="inline">
        File format
        <select
          value={format}
          onChange={(event) => onChange({ tabularFormat: event.target.value })}
        >
          {TABULAR_FORMATS.map((item) => (
            <option key={item} value={item}>
              {FORMAT_LABELS[item]}
            </option>
          ))}
        </select>
      </label>

      {showLayout && (
        <label className="inline">
          Scores layout
          <select
            value={layout}
            onChange={(event) => onChange({ layout: event.target.value })}
          >
            {LAYOUTS.map((item) => (
              <option key={item} value={item}>
                {LAYOUT_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
      )}
    </fieldset>
  );
}

export default FormatPicker;
