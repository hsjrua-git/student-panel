import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  listEvaluations,
  listPeriodParameters,
  saveEvaluations,
} from '../api/evaluations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import EvaluationGrid from '../components/EvaluationGrid.jsx';
import GroupFilter from '../components/GroupFilter.jsx';
import PeriodParametersPanel from '../components/PeriodParametersPanel.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import {
  buildEntries,
  buildSavePayload,
  cellKey,
  lockedDraftKeys,
} from '../lib/cells.js';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';
import { usePeriods } from '../lib/usePeriods.js';

function EvaluatePage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const periodsQuery = usePeriods();
  const periods = periodsQuery.data;

  const [chosenPeriod, setChosenPeriod] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [noteDrafts, setNoteDrafts] = useState({});
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [groupId, setGroupId] = useState('');
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
  const savedNotes = useMemo(
    () =>
      Object.fromEntries(
        (savedQuery.data ?? [])
          .filter((item) => item.comment != null)
          .map((item) => [
            cellKey(item.studentId, item.parameterId),
            item.comment,
          ])
      ),
    [savedQuery.data]
  );
  const locks = useMemo(
    () =>
      Object.fromEntries(
        (savedQuery.data ?? []).map((item) => [
          cellKey(item.studentId, item.parameterId),
          { isLocked: item.isLocked, lockedAt: item.lockedAt },
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
      setNoteDrafts({});
    },
  });
  // Read the mutation through a ref so the cell/note change handlers can stay
  // referentially stable (see useCallback below); the memoized EvaluationRow
  // relies on those callbacks not changing identity between keystrokes. The ref
  // is synced in an effect (not during render) to satisfy the rules of refs.
  const mutationRef = useRef(mutation);
  useEffect(() => {
    mutationRef.current = mutation;
  }, [mutation]);

  const draftCount = new Set([
    ...Object.keys(drafts),
    ...Object.keys(noteDrafts),
  ]).size;
  const lockedCount = lockedDraftKeys(drafts, noteDrafts, locks).length;
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

  const handleCellChange = useCallback((key, text, original) => {
    if (!mutationRef.current.isIdle) mutationRef.current.reset();
    setDrafts((current) => {
      const next = { ...current };
      if (text.trim() === original) {
        delete next[key];
      } else {
        next[key] = text;
      }
      return next;
    });
  }, []);

  const handleNoteChange = useCallback((key, text, originalNote) => {
    if (!mutationRef.current.isIdle) mutationRef.current.reset();
    setNoteDrafts((current) => {
      const next = { ...current };
      if (text === originalNote) {
        delete next[key];
      } else {
        next[key] = text;
      }
      return next;
    });
  }, []);

  function handlePeriodChange(next) {
    if (
      draftCount > 0 &&
      !window.confirm('You have unsaved changes. Discard them and switch period?')
    ) {
      return;
    }
    setChosenPeriod(next);
    setDrafts({});
    setNoteDrafts({});
    mutation.reset();
  }

  function handleSave() {
    const { entries, errors } = buildSavePayload({
      drafts,
      noteDrafts,
      savedValues: saved,
      parametersById,
    });
    if (Object.keys(errors).length > 0 || entries.length === 0) return;

    let overrideReason;
    if (lockedCount > 0) {
      const answer = window.prompt(
        `${lockedCount} of your changes are to locked scores. ` +
          'Enter the reason for changing them (5 to 300 characters). ' +
          'It is recorded in the audit log.'
      );
      if (answer === null) return;
      overrideReason = answer;
    }
    mutation.mutate({ periodNumber, entries, overrideReason });
  }

  function handleDiscard() {
    setDrafts({});
    setNoteDrafts({});
    mutation.reset();
  }

  function handleSearchChange(event) {
    setSearchText(event.target.value);
    setPage(1);
  }

  function handleGroupChange(value) {
    setGroupId(value);
    setPage(1);
  }

  if (!can('scores.enter')) {
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
    saveLabel =
      `Save ${draftCount} change${draftCount === 1 ? '' : 's'}` +
      (lockedCount > 0 ? ` (${lockedCount} locked)` : '');
  }

  return (
    <main className="wide">
      <h1>Evaluate</h1>

      {can('data.import') && (
        <p>
          <Link to="/evaluate/import">Import scores from a CSV file…</Link>
        </p>
      )}

      <PeriodPicker
        periods={periods}
        value={periodNumber}
        onChange={handlePeriodChange}
      />

      {can('parameters.manage') && (
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
        <GroupFilter value={groupId} onChange={handleGroupChange} />
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

      <p className="hint">
        A score can be changed for 7 days after it is first saved (1 day if it
        was entered late). After that it is locked
        {can('scores.override')
          ? ' (🔒). You can still change it, with a written reason.'
          : ' (🔒) and only someone who can override locks can change it.'}
      </p>

      {hasLiveErrors && (
        <p className="error" role="alert">
          Fix the red cells before saving.
        </p>
      )}
      {mutation.isError && (
        <p className="error" role="alert">
          {mutation.error.message}
        </p>
      )}
      {mutation.isSuccess && (
        <p className="success" role="status">
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
          savedNotes={savedNotes}
          locks={locks}
          drafts={drafts}
          noteDrafts={noteDrafts}
          cellErrors={cellErrors}
          onCellChange={handleCellChange}
          onNoteChange={handleNoteChange}
          canOverride={can('scores.override')}
          search={search}
          page={page}
          onPageChange={setPage}
          groupId={groupId || null}
        />
      )}
    </main>
  );
}

export default EvaluatePage;