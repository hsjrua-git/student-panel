import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  listEvaluations,
  listPeriodParameters,
  saveEvaluations,
} from '../api/evaluations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { errorMessage } from '../i18n/errors.js';
import EmptyState from '../components/EmptyState.jsx';
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
  const { t } = useTranslation(['students', 'common']);
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
      !window.confirm(t('evaluate.unsavedConfirm'))
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
        t('evaluate.overridePrompt', { count: lockedCount })
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
        <h1>{t('evaluate.title')}</h1>
        <EmptyState
          title={t('shared.readOnlyTitle')}
          description={t('evaluate.readOnlyDescription')}
        />
      </main>
    );
  }
  if (periodsQuery.isPending) {
    return (
      <main aria-busy="true">
        <div className="page-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>{t('common:status.loading')}</p>
        </div>
      </main>
    );
  }
  if (periodsQuery.isError) {
    return (
      <main>
        <EmptyState
          tone="danger"
          title={t('evaluate.loadErrorTitle')}
          description={errorMessage(periodsQuery.error)}
        />
      </main>
    );
  }
  if (!periods.anchorDate) {
    return (
      <main>
        <h1>{t('evaluate.title')}</h1>
        <EmptyState
          title={t('evaluate.calendarTitle')}
          description={t('evaluate.calendarDescription')}
        >
          <p>
            <Link to="/settings">{t('evaluate.goToSettings')}</Link>
          </p>
        </EmptyState>
      </main>
    );
  }
  if (periods.current === null) {
    return (
      <main>
        <h1>{t('evaluate.title')}</h1>
        <EmptyState
          title={t('evaluate.notStartedTitle')}
          description={t('evaluate.notStartedDescription')}
        />
      </main>
    );
  }

  const isLoading = parametersQuery.isPending || savedQuery.isPending;
  const loadError = parametersQuery.error ?? savedQuery.error;

  let saveLabel = t('common:actions.save');
  if (mutation.isPending) {
    saveLabel = t('common:actions.saving');
  } else if (draftCount > 0) {
    saveLabel =
      t('evaluate.saveCount', { count: draftCount }) +
      (lockedCount > 0
        ? t('evaluate.saveLockedSuffix', { count: lockedCount })
        : '');
  }

  return (
    <main className="wide">
      <div className="page-head">
        <h1>{t('evaluate.title')}</h1>
        {can('data.import') && (
          <div className="page-head-actions">
            <Link className="btn" to="/evaluate/import">
              {t('evaluate.importScores')}
            </Link>
          </div>
        )}
      </div>

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

      <div className="control-bar">
        <input
          type="search"
          className="search"
          value={searchText}
          onChange={handleSearchChange}
          placeholder={t('evaluate.searchPlaceholder')}
          aria-label={t('list.searchLabel')}
        />
        <GroupFilter value={groupId} onChange={handleGroupChange} />
        <span className="spacer" />
        <button
          type="button"
          className="primary"
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
          {t('evaluate.discard')}
        </button>
      </div>

      <p className="hint">
        {t('evaluate.lockHint')}
        {can('scores.override')
          ? t('evaluate.lockHintOverride')
          : t('evaluate.lockHintNoOverride')}
      </p>

      {hasLiveErrors && (
        <p className="error" role="alert">
          {t('evaluate.fixCells')}
        </p>
      )}
      {mutation.isError && (
        <p className="error" role="alert">
          {errorMessage(mutation.error)}
        </p>
      )}
      {mutation.isSuccess && (
        <p className="success" role="status">
          {t('evaluate.saved', { count: mutation.data.changed })}
        </p>
      )}

      {loadError && <p className="error">{errorMessage(loadError)}</p>}
      {isLoading && !loadError && (
        <p className="hint">{t('common:status.loading')}</p>
      )}
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