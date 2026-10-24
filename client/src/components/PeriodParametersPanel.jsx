import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listPeriodParameters } from '../api/evaluations.js';
import { errorMessage } from '../i18n/errors.js';
import {
  createParameterChange,
  getChangeImpact,
  listParameters,
} from '../api/parameters.js';

function ParameterChoice({ parameter, used, periodNumber, disabled }) {
  const { t } = useTranslation(['students', 'common']);
  const queryClient = useQueryClient();
  const action = used ? 'remove' : 'add';
  const [isOpen, setIsOpen] = useState(false);
  const [scope, setScope] = useState('this_period_only');
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState(null);

  const change = useMutation({
    mutationFn: createParameterChange,
    onSuccess: () => {
      setIsOpen(false);
      queryClient.invalidateQueries({ queryKey: ['period-parameters'] });
      queryClient.invalidateQueries({ queryKey: ['parameter-changes'] });
    },
  });

  async function handleConfirm() {
    setProblem(null);
    const request = { parameterId: parameter.id, periodNumber, scope, action };

    if (action === 'remove') {
      setChecking(true);
      try {
        const impact = await getChangeImpact(request);
        if (impact.affectedScores > 0) {
          const ok = window.confirm(
            t('parameters.impactConfirm', {
              count: impact.affectedScores,
              name: parameter.name,
              periods: impact.periods.join(', '),
            })
          );
          if (!ok) return;
        }
      } catch (err) {
        setProblem(errorMessage(err));
        return;
      } finally {
        setChecking(false);
      }
    }
    change.mutate(request);
  }

  return (
    <li className="param-choice">
      <div className="param-line">
        <span className="chip-row">
          <strong>{parameter.name}</strong>
          <span className={used ? 'chip ok' : 'chip'}>
            {used ? t('parameters.usedChip') : t('parameters.notUsedChip')}
          </span>
        </span>
        {!isOpen && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            disabled={disabled}
          >
            {used
              ? t('parameters.removeDots')
              : t('parameters.addDots')}
          </button>
        )}
      </div>

      {isOpen && (
        <div className="param-form">
          <label>
            <input
              type="radio"
              name={`scope-${parameter.id}`}
              checked={scope === 'this_period_only'}
              onChange={() => setScope('this_period_only')}
            />
            {t('parameters.scopeThisPeriod', { period: periodNumber })}
          </label>
          <label>
            <input
              type="radio"
              name={`scope-${parameter.id}`}
              checked={scope === 'from_here_on'}
              onChange={() => setScope('from_here_on')}
            />
            {t('parameters.scopeFromHere', { period: periodNumber })}
          </label>
          <div className="row">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={checking || change.isPending}
            >
              {used ? t('parameters.removeBtn') : t('common:actions.add')}
            </button>
            <button type="button" onClick={() => setIsOpen(false)}>
              {t('common:actions.cancel')}
            </button>
          </div>
        </div>
      )}

      {problem && <p className="error">{problem}</p>}
      {change.isError && (
        <p className="error">{errorMessage(change.error)}</p>
      )}
    </li>
  );
}

function PeriodParametersPanel({ periodNumber, disabled }) {
  const { t } = useTranslation(['students', 'common']);
  const catalog = useQuery({
    queryKey: ['parameters'],
    queryFn: listParameters,
  });
  const inUse = useQuery({
    queryKey: ['period-parameters', periodNumber],
    queryFn: () => listPeriodParameters(periodNumber),
  });

  if (catalog.isPending || inUse.isPending) {
    return <p>{t('parameters.loading')}</p>;
  }
  const failure = catalog.error ?? inUse.error;
  if (failure) return <p className="error">{errorMessage(failure)}</p>;

  const usedIds = new Set(inUse.data.map((parameter) => parameter.id));

  return (
    <details className="panel">
      <summary>
        {t('parameters.panelSummary', {
          period: periodNumber,
          count: inUse.data.length,
        })}
      </summary>
      <p className="hint">{t('parameters.scopeHint')}</p>
      {disabled && (
        <p className="hint">{t('parameters.saveOrDiscardFirst')}</p>
      )}
      <ul className="plain-list">
        {catalog.data.map((parameter) => (
          <ParameterChoice
            key={`${parameter.id}:${periodNumber}`}
            parameter={parameter}
            used={usedIds.has(parameter.id)}
            periodNumber={periodNumber}
            disabled={disabled}
          />
        ))}
      </ul>
    </details>
  );
}

export default PeriodParametersPanel;