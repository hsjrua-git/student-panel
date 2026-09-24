import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateParameter } from '../api/parameters.js';
import { formatRange } from '../lib/format.js';
import { numberToText, parseOptionalNumber } from '../lib/numbers.js';
import { useAuth } from '../auth/AuthContext.jsx';

function ParameterRow({ parameter }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(parameter.name);
  const [unit, setUnit] = useState(parameter.unit ?? '');
  const [minText, setMinText] = useState(numberToText(parameter.minValue));
  const [maxText, setMaxText] = useState(numberToText(parameter.maxValue));
  const [problem, setProblem] = useState(null);

  const update = useMutation({
    mutationFn: (fields) => updateParameter(parameter.id, fields),
    onSuccess: () => {
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['parameters'] });
    },
  });

  function startEditing() {
    setName(parameter.name);
    setUnit(parameter.unit ?? '');
    setMinText(numberToText(parameter.minValue));
    setMaxText(numberToText(parameter.maxValue));
    setProblem(null);
    update.reset();
    setIsEditing(true);
  }

  function handleSave(event) {
    event.preventDefault();

    const min = parseOptionalNumber(minText);
    const max = parseOptionalNumber(maxText);

    if (name.trim() === '') {
      setProblem('Please enter a name.');
      return;
    }
    if (min.error || max.error) {
      setProblem('Minimum and maximum must be numbers, or left empty.');
      return;
    }
    if (min.value !== null && max.value !== null && min.value > max.value) {
      setProblem('The minimum cannot be larger than the maximum.');
      return;
    }

    setProblem(null);
    update.mutate({
      name,
      unit: unit.trim() === '' ? null : unit,
      minValue: min.value,
      maxValue: max.value,
    });
  }

  if (isEditing) {
    return (
      <div className="param-card">
        <form onSubmit={handleSave} className="edit-form">
            <label>
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={60}
                autoComplete="off"
              />
            </label>
            <label>
              Unit (optional)
              <input
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                maxLength={20}
                autoComplete="off"
              />
            </label>
            <label>
              Minimum (optional)
              <input
                type="number"
                step="any"
                value={minText}
                onChange={(event) => setMinText(event.target.value)}
              />
            </label>
            <label>
              Maximum (optional)
              <input
                type="number"
                step="any"
                value={maxText}
                onChange={(event) => setMaxText(event.target.value)}
              />
            </label>
            <div className="row">
              <button type="submit" disabled={update.isPending}>
                Save
              </button>
              <button type="button" onClick={() => setIsEditing(false)}>
                Cancel
              </button>
            </div>
            {problem && <p className="error">{problem}</p>}
            {update.isError && <p className="error">{update.error.message}</p>}
          </form>
      </div>
    );
  }

  const range = formatRange(parameter);
  return (
    <div className="param-card">
      <div className="param-card-head">
        <h3>{parameter.name}</h3>
        {can('parameters.manage') && (
          <button type="button" className="quiet" onClick={startEditing}>
            Edit
          </button>
        )}
      </div>
      <span className="chip-row">
        {range !== '—' && <span className="chip">Range {range}</span>}
        {parameter.unit && <span className="chip">{parameter.unit}</span>}
        {range === '—' && !parameter.unit && (
          <span className="hint">No range or unit set</span>
        )}
      </span>
    </div>
  );
}

export default ParameterRow;