import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createParameter } from '../api/parameters.js';
import { errorMessage } from '../i18n/errors.js';
import { parseOptionalNumber } from '../lib/numbers.js';
import { usePeriods } from '../lib/usePeriods.js';

function ParameterForm() {
  const { t } = useTranslation(['students', 'common']);
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

    if (name.trim() === '') return fail(t('parameters.problemName'));
    if (min.error || max.error) {
      return fail(t('parameters.problemNumbers'));
    }
    if (min.value !== null && max.value !== null && min.value > max.value) {
      return fail(t('parameters.problemRange'));
    }
    if (!Number.isInteger(startPeriod) || startPeriod < 1) {
      return fail(t('parameters.problemStart'));
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
          {t('common:table.name')}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('parameters.namePlaceholder')}
            maxLength={60}
            autoComplete="off"
          />
        </label>
        <label>
          {t('parameters.unitLabel')}
          <input
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            placeholder={t('parameters.unitPlaceholder')}
            maxLength={20}
            autoComplete="off"
          />
        </label>
        <label>
          {t('parameters.minLabel')}
          <input
            type="number"
            step="any"
            value={minText}
            onChange={(event) => setMinText(event.target.value)}
          />
        </label>
        <label>
          {t('parameters.maxLabel')}
          <input
            type="number"
            step="any"
            value={maxText}
            onChange={(event) => setMaxText(event.target.value)}
          />
        </label>
        <label>
          {t('parameters.usedFrom')}
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
        {mutation.isPending ? t('forms.adding') : t('parameters.addBtn')}
      </button>

      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {mutation.isError && (
        <p className="error" role="alert">
          {errorMessage(mutation.error)}
        </p>
      )}
      {mutation.isSuccess && (
        <p className="success" role="status">
          {t('parameters.addedFromPeriod', {
            name: mutation.data.name,
            period: mutation.variables.startPeriod,
          })}
        </p>
      )}
    </form>
  );
}

export default ParameterForm;