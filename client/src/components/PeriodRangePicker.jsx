import { useMemo } from 'react';

// The "which periods" selector: all periods, a from–to range, or a hand-picked
// set. `value` is the config.periods slice ({ mode, from, to, numbers });
// `periods` is the loaded calendar ({ periods:[{number}], current }). Only
// periods that have started (≤ current) are offered.
function PeriodRangePicker({ value, periods, onChange }) {
  // Destructure `current` into a local so the memo below reads a plain variable
  // rather than a `.current` property — the React Compiler otherwise mistakes
  // `periods.current` for a ref access and skips optimizing the component.
  const { periods: periodList, current } = periods;
  const available = useMemo(
    () => periodList.map((period) => period.number).filter((n) => n <= current),
    [periodList, current]
  );
  const selected = useMemo(() => new Set(value.numbers), [value.numbers]);

  function setMode(mode) {
    onChange({ ...value, mode });
  }

  function setFrom(from) {
    onChange({ ...value, from });
  }

  function setTo(to) {
    onChange({ ...value, to });
  }

  function toggle(number, on) {
    const numbers = on
      ? [...selected, number]
      : value.numbers.filter((item) => item !== number);
    onChange({ ...value, numbers: [...new Set(numbers)].sort((a, b) => a - b) });
  }

  const from = value.from ?? 1;
  const to = value.to ?? current;

  return (
    <fieldset className="export-fieldset">
      <legend>Periods</legend>
      <div className="radio-row">
        <label className="inline">
          <input
            type="radio"
            name="period-mode"
            checked={value.mode === 'all'}
            onChange={() => setMode('all')}
          />
          All periods
        </label>
        <label className="inline">
          <input
            type="radio"
            name="period-mode"
            checked={value.mode === 'range'}
            onChange={() => setMode('range')}
          />
          Range
        </label>
        <label className="inline">
          <input
            type="radio"
            name="period-mode"
            checked={value.mode === 'selection'}
            onChange={() => setMode('selection')}
          />
          Pick periods
        </label>
      </div>

      {value.mode === 'range' && (
        <div className="range-row">
          <label className="inline">
            From
            <select value={from} onChange={(event) => setFrom(Number(event.target.value))}>
              {available.map((number) => (
                <option key={number} value={number}>
                  Period {number}
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            To
            <select value={to} onChange={(event) => setTo(Number(event.target.value))}>
              {available.map((number) => (
                <option key={number} value={number}>
                  Period {number}
                </option>
              ))}
            </select>
          </label>
          {from > to && (
            <span className="hint">The range will be read low-to-high.</span>
          )}
        </div>
      )}

      {value.mode === 'selection' && (
        <div className="columns-list scroll-list">
          {available.map((number) => (
            <label key={number} className="inline">
              <input
                type="checkbox"
                checked={selected.has(number)}
                onChange={(event) => toggle(number, event.target.checked)}
              />
              Period {number}
              {number === current ? ' (current)' : ''}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

export default PeriodRangePicker;
