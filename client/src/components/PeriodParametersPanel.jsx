import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listPeriodParameters } from '../api/evaluations.js';
import {
  createParameterChange,
  getChangeImpact,
  listParameters,
} from '../api/parameters.js';

function ParameterChoice({ parameter, used, periodNumber, disabled }) {
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
            `${impact.affectedScores} saved score(s) for ${parameter.name} ` +
              `(period ${impact.periods.join(', ')}) will no longer appear in ` +
              'the entry grid. They are kept, not deleted, and come back if ' +
              'you undo this change. Continue?'
          );
          if (!ok) return;
        }
      } catch (err) {
        setProblem(err.message);
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
            {used ? 'Used' : 'Not used'}
          </span>
        </span>
        {!isOpen && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            disabled={disabled}
          >
            {used ? 'Remove…' : 'Add…'}
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
            This period only (Period {periodNumber})
          </label>
          <label>
            <input
              type="radio"
              name={`scope-${parameter.id}`}
              checked={scope === 'from_here_on'}
              onChange={() => setScope('from_here_on')}
            />
            Period {periodNumber} and all following periods
          </label>
          <div className="row">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={checking || change.isPending}
            >
              {used ? 'Remove' : 'Add'}
            </button>
            <button type="button" onClick={() => setIsOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {problem && <p className="error">{problem}</p>}
      {change.isError && <p className="error">{change.error.message}</p>}
    </li>
  );
}

function PeriodParametersPanel({ periodNumber, disabled }) {
  const catalog = useQuery({
    queryKey: ['parameters'],
    queryFn: listParameters,
  });
  const inUse = useQuery({
    queryKey: ['period-parameters', periodNumber],
    queryFn: () => listPeriodParameters(periodNumber),
  });

  if (catalog.isPending || inUse.isPending) return <p>Loading parameters...</p>;
  const failure = catalog.error ?? inUse.error;
  if (failure) return <p className="error">{failure.message}</p>;

  const usedIds = new Set(inUse.data.map((parameter) => parameter.id));

  return (
    <details className="panel">
      <summary>
        Parameters for Period {periodNumber} ({inUse.data.length} used)
      </summary>
      <p className="hint">
        "This period only" affects just this period. "All following periods"
        applies from here until the next change to that parameter. Saved scores
        are never deleted.
      </p>
      {disabled && (
        <p className="hint">
          Save or discard your unsaved changes before changing parameters.
        </p>
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