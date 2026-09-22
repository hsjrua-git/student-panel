import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createParameter } from '../api/parameters.js';
import { parseOptionalNumber } from '../lib/numbers.js';
import { usePeriods } from '../lib/usePeriods.js';

function ParameterForm() {
  const queryClient = useQueryClient();
  const { data: periods } = usePeriods();

  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [startText, setStartText] = useState(null);
  const [problem, setProblem] = useState(null);

  const shownStart = startText ?? String(periods?.current ?? 1);

  const mutation = useMutation({
    mutationFn: createParameter,
    onSuccess: () => {
      setName('');
      setUnit('');
      setMinText('');
      setMaxText('');
      setStartText(null);
      queryClient.invalidateQueries({ queryKey: ['parameters'] });
      queryClient.invalidateQueries({ queryKey: ['parameter-changes'] });
    },
  });

  function fail(message) {
    mutation.reset();
    setProblem(message);
  }

  function handleSubmit(event) {
    event.preventDefault();

    const min = parseOptionalNumber(minText);
    const max = parseOptionalNumber(maxText);
    const startPeriod = Number(shownStart);

    if (name.trim() === '') return fail('Please enter a name.');
    if (min.error || max.error) {
      return fail('Minimum and maximum must be numbers, or left empty.');
    }
    if (min.value !== null && max.value !== null && min.value > max.value) {
      return fail('The minimum cannot be larger than the maximum.');
    }
    if (!Number.isInteger(startPeriod) || startPeriod < 1) {
      return fail('The starting period must be a whole number from 1.');
    }

    setProblem(null);
    mutation.mutate({
      name,
      unit: unit.trim() === '' ? null : unit,
      minValue: min.value,
      maxValue: max.value,
      startPeriod,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <label>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Speed"
            maxLength={60}
            autoComplete="off"
          />
        </label>
        <label>
          Unit (optional)
          <input
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            placeholder="e.g. km/h"
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
        <label>
          Used from period
          <input
            type="number"
            min="1"
            step="1"
            value={shownStart}
            onChange={(event) => setStartText(event.target.value)}
          />
        </label>
      </div>

      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Adding...' : 'Add parameter'}
      </button>

      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {mutation.isError && (
        <p className="error" role="alert">
          {mutation.error.message}
        </p>
      )}
      {mutation.isSuccess && (
        <p className="success" role="status">
          Added {mutation.data.name}, used from Period{' '}
          {mutation.variables.startPeriod} on.
        </p>
      )}
    </form>
  );
}

export default ParameterForm;