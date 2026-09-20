import { formatIsoDate } from '../lib/format.js';

function PeriodPicker({ periods, value, onChange }) {
  const list = periods.periods;
  const selected = list.find((period) => period.number === value);

  return (
    <div className="period-picker">
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 1}>
        Previous
      </button>
      <select
        aria-label="Period"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {[...list].reverse().map((period) => (
          <option key={period.number} value={period.number}>
            Period {period.number}
            {period.number === periods.current ? ' (current)' : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= periods.current}
      >
        Next
      </button>
      {selected && (
        <span className="hint">
          {formatIsoDate(selected.startDate)} to {formatIsoDate(selected.endDate)}
        </span>
      )}
    </div>
  );
}

export default PeriodPicker;