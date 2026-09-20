import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  listEvaluations,
  listPeriodParameters,
  saveEvaluations,
} from '../api/evaluations.js';
import EvaluationGrid from '../components/EvaluationGrid.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import { buildEntries, cellKey } from '../lib/cells.js';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';
import { usePeriods } from '../lib/usePeriods.js';
import PeriodParametersPanel from '../components/PeriodParametersPanel.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

function EvaluatePage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const periodsQuery = usePeriods();
  const periods = periodsQuery.data;

  const [chosenPeriod, setChosenPeriod] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(searchText.trim(), 300);

  const periodNumber = chosenPeriod ?? periods?.current ?? null;

  const parametersQuery = useQuery({
    queryKey: ['period-parameters', periodNumber],
    queryFn: () => listPeriodParameters(periodNumber),
    enabled: periodNumber !== null,
  });
  const savedQuery = useQuery({
    queryKey: ['evaluations', { periodNumber }],
    queryFn: () => listEvaluations({ periodNumber }),
    enabled: periodNumber !== null,
  });

  const saved = useMemo(
    () =>
      Object.fromEntries(
        (savedQuery.data ?? []).map((item) => [
          cellKey(item.studentId, item.parameterId),
          item.value,
        ])
      ),
    [savedQuery.data]
  );
  const parametersById = useMemo(
    () => new Map((parametersQuery.data ?? []).map((p) => [p.id, p])),
    [parametersQuery.data]
  );
  const liveErrors = useMemo(
    () => buildEntries(drafts, parametersById).errors,
    [drafts, parametersById]
  );

  const mutation = useMutation({
    mutationFn: saveEvaluations,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['evaluations'] });
      setDrafts({});
    },
  });

  const draftCount = Object.keys(drafts).length;
  const hasLiveErrors = Object.keys(liveErrors).length > 0;

  const serverErrors = Object.fromEntries(
    (mutation.error?.data?.problems ?? []).map((problem) => [
      cellKey(problem.studentId, problem.parameterId),
      problem.message,
    ])
  );
  const cellErrors = { ...serverErrors, ...liveErrors };

  useEffect(() => {
    if (draftCount === 0) return;
    function warn(event) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draftCount]);

  function handleCellChange(key, text, original) {
    if (!mutation.isIdle) mutation.reset();
    setDrafts((current) => {
      const next = { ...current };
      if (text.trim() === original) {
        delete next[key];
      } else {
        next[key] = text;
      }
      return next;
    });
  }

  function handlePeriodChange(next) {
    if (
      draftCount > 0 &&
      !window.confirm('You have unsaved changes. Discard them and switch period?')
    ) {
      return;
    }
    setChosenPeriod(next);
    setDrafts({});
    mutation.reset();
  }

  function handleSave() {
    const { entries, errors } = buildEntries(drafts, parametersById);
    if (Object.keys(errors).length > 0 || entries.length === 0) return;
    mutation.mutate({ periodNumber, entries });
  }

  function handleDiscard() {
    setDrafts({});
    mutation.reset();
  }

  function handleSearchChange(event) {
    setSearchText(event.target.value);
    setPage(1);
  }

  if (!can('staff')) {
    return (
      <main>
        <h1>Evaluate</h1>
        <p>
          You do not have permission to enter scores. You can see scores on
          each student's page.
        </p>
      </main>
    );
  }

  if (periodsQuery.isPending) {
    return (
      <main>
        <p>Loading...</p>
      </main>
    );
  }
  if (periodsQuery.isError) {
    return (
      <main>
        <p className="error">{periodsQuery.error.message}</p>
      </main>
    );
  }
  if (!periods.anchorDate) {
    return (
      <main>
        <h1>Evaluate</h1>
        <p>
          Set the period start date first, on the{' '}
          <Link to="/settings">Settings</Link> page.
        </p>
      </main>
    );
  }
  if (periods.current === null) {
    return (
      <main>
        <h1>Evaluate</h1>
        <p>Period 1 has not started yet.</p>
      </main>
    );
  }

  const isLoading = parametersQuery.isPending || savedQuery.isPending;
  const loadError = parametersQuery.error ?? savedQuery.error;

  let saveLabel = 'Save';
  if (mutation.isPending) {
    saveLabel = 'Saving...';
  } else if (draftCount > 0) {
    saveLabel = `Save ${draftCount} change${draftCount === 1 ? '' : 's'}`;
  }

  return (
    <main className="wide">
      <h1>Evaluate</h1>

      <PeriodPicker
        periods={periods}
        value={periodNumber}
        onChange={handlePeriodChange}
      />

      {can('admin') && (
        <PeriodParametersPanel
          periodNumber={periodNumber}
          disabled={draftCount > 0}
        />
      )}

      <div className="toolbar">
        <input
          type="search"
          className="search"
          value={searchText}
          onChange={handleSearchChange}
          placeholder="Search students by name or code"
          aria-label="Search students"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={draftCount === 0 || hasLiveErrors || mutation.isPending}
        >
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={handleDiscard}
          disabled={draftCount === 0 || mutation.isPending}
        >
          Discard
        </button>
      </div>

      {hasLiveErrors && (
        <p className="error">Fix the red cells before saving.</p>
      )}
      {mutation.isError && <p className="error">{mutation.error.message}</p>}
      {mutation.isSuccess && (
        <p className="success">
          Saved. {mutation.data.changed} value
          {mutation.data.changed === 1 ? '' : 's'} changed.
        </p>
      )}

      {loadError && <p className="error">{loadError.message}</p>}
      {isLoading && !loadError && <p>Loading...</p>}
      {!isLoading && !loadError && (
        <EvaluationGrid
          parameters={parametersQuery.data}
          saved={saved}
          drafts={drafts}
          cellErrors={cellErrors}
          onCellChange={handleCellChange}
          search={search}
          page={page}
          onPageChange={setPage}
        />
      )}
    </main>
  );
}

export default EvaluatePage;