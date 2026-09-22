import { useState } from 'react';
import { MAX_FILTERS, OPERATORS, newFilterKey } from '../lib/resultsView.js';

function FilterRow({ filter, parameters, onChange, onRemove }) {
  const [text, setText] = useState(
    filter.value === undefined ? '' : String(filter.value)
  );
  const operator = OPERATORS.find((item) => item.value === filter.op);
  const needsValue = operator?.needsValue ?? false;
  const invalid =
    needsValue && (text.trim() === '' || !Number.isFinite(Number(text)));
  const known = parameters.some((parameter) => parameter.id === filter.parameterId);

  function handleOperatorChange(event) {
    const op = event.target.value;
    const wantsValue = OPERATORS.find((item) => item.value === op).needsValue;
    if (!wantsValue) {
      onChange({ key: filter.key, parameterId: filter.parameterId, op });
      return;
    }
    const number = Number(text);
    const usable = text.trim() !== '' && Number.isFinite(number);
    if (!usable) setText('0');
    onChange({
      key: filter.key,
      parameterId: filter.parameterId,
      op,
      value: usable ? number : 0,
    });
  }

  function handleValueChange(event) {
    const next = event.target.value;
    setText(next);
    const number = Number(next);
    if (next.trim() !== '' && Number.isFinite(number)) {
      onChange({ ...filter, value: number });
    }
  }

  return (
    <div className="filter-row">
      <select
        aria-label="Parameter"
        value={filter.parameterId}
        onChange={(event) =>
          onChange({ ...filter, parameterId: event.target.value })
        }
      >
        {!known && <option value={filter.parameterId}>Unknown parameter</option>}
        {parameters.map((parameter) => (
          <option key={parameter.id} value={parameter.id}>
            {parameter.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Condition"
        value={filter.op}
        onChange={handleOperatorChange}
      >
        {OPERATORS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      {needsValue && (
        <input
          type="number"
          step="any"
          aria-label="Value"
          aria-invalid={invalid}
          className={invalid ? 'invalid' : undefined}
          value={text}
          onChange={handleValueChange}
        />
      )}
      <button type="button" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

function FilterEditor({ filters, parameters, onChange }) {
  const canAdd = parameters.length > 0 && filters.length < MAX_FILTERS;

  function add() {
    onChange([
      ...filters,
      { key: newFilterKey(), parameterId: parameters[0].id, op: 'lt', value: 5 },
    ]);
  }

  return (
    <div>
      {filters.length === 0 && (
        <p className="hint">No filters. Every student is shown.</p>
      )}
      {filters.map((filter, index) => (
        <FilterRow
          key={filter.key ?? index}
          filter={filter}
          parameters={parameters}
          onChange={(next) =>
            onChange(filters.map((item, i) => (i === index ? next : item)))
          }
          onRemove={() => onChange(filters.filter((_, i) => i !== index))}
        />
      ))}
      <button type="button" onClick={add} disabled={!canAdd}>
        Add filter
      </button>
      {filters.length >= MAX_FILTERS && (
        <span className="hint"> Maximum of {MAX_FILTERS} filters.</span>
      )}
    </div>
  );
}

export default FilterEditor;