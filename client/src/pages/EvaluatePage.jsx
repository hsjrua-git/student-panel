import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { getMatrix, saveEvaluations } from '../api/evaluations.js';
import { listGroups } from '../api/groups.js';
import EmptyState from '../components/EmptyState.jsx';
import EvaluationMatrix from '../components/EvaluationMatrix.jsx';
import {
  buildEntries,
  buildSavePayload,
  cellKey,
  lockedDraftKeys,
} from '../lib/cells.js';
import { usePeriods } from '../lib/usePeriods.js';

// The same indented, tree-ordered list the Groups page and GroupFilter use.
function orderGroups(groups) {
  const byParent = new Map();
  for (const group of groups) {
    const key = group.parentId ?? 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(group);
  }
  const walk = (parentKey, depth) =>
    (byParent.get(parentKey) ?? []).flatMap((group) => [
      { ...group, depth },
      ...walk(group.id, depth + 1),
    ]);
  return walk('root', 0);
}

// Scoring is per group + per period: pick one of each, then fill the matrix of
// leaf parameters (rows) against the group's own score and each member (cols).
export default function EvaluatePage() {
  const queryClient = useQueryClient();
  const periodsQuery = usePeriods();
  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: () => listGroups() });

  const [groupId, setGroupId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [drafts, setDrafts] = useState({});
  const [noteDrafts, setNoteDrafts] = useState({});
  const periods = periodsQuery.data ?? [];
  const groups = useMemo(
    () => orderGroups(groupsQuery.data ?? []),
    [groupsQuery.data],
  );

  const ready = groupId !== '' && periodId !== '';

  const matrixQuery = useQuery({
    queryKey: ['matrix', { groupId, periodId }],
    queryFn: () => getMatrix({ groupId, periodId }),
    enabled: ready,
  });
  const matrix = matrixQuery.data;

  const saved = useMemo(() => {
    const out = {};
    for (const [key, cell] of Object.entries(matrix?.cells ?? {})) {
      out[key] = cell.value;
    }
    return out;
  }, [matrix]);
  const savedNotes = useMemo(() => {
    const out = {};
    for (const [key, cell] of Object.entries(matrix?.cells ?? {})) {
      if (cell.comment != null) out[key] = cell.comment;
    }
    return out;
  }, [matrix]);
  const locks = useMemo(() => {
    const out = {};
    for (const [key, cell] of Object.entries(matrix?.cells ?? {})) {
      out[key] = { isLocked: cell.isLocked, lockedAt: cell.lockedAt };
    }
    return out;
  }, [matrix]);
  const parametersById = useMemo(
    () => new Map((matrix?.parameters ?? []).map((p) => [p.id, p])),
    [matrix],
  );
  const liveErrors = useMemo(
    () => buildEntries(drafts, parametersById, groupId).errors,
    [drafts, parametersById, groupId],
  );

  const mutation = useMutation({
    mutationFn: saveEvaluations,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['matrix'] });
      queryClient.invalidateQueries({ queryKey: ['evaluations'] });
      queryClient.invalidateQueries({ queryKey: ['results'] });
      queryClient.invalidateQueries({ queryKey: ['trends'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setDrafts({});
      setNoteDrafts({});
    },
  });
  // Read the mutation through a ref so the cell/note change handlers can stay
  // referentially stable (see useCallback below); the memoized MatrixRow relies
  // on those callbacks not changing identity between keystrokes.
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
    ]),
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
  function switchWith(apply) {
    if (
      draftCount > 0 &&
      !window.confirm('You have unsaved changes. Discard them and switch?')
    ) {
      return;
    }
    apply();
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
      groupId,
    });
    if (Object.keys(errors).length > 0 || entries.length === 0) return;

    let overrideReason;
    if (lockedCount > 0) {
      const answer = window.prompt(
        `${lockedCount} of your changes are to locked scores. ` +
          'Enter the reason for changing them (5 to 300 characters). ' +
          'It is recorded in the audit log.',
      );
      if (answer === null) return;
      overrideReason = answer;
    }
    mutation.mutate({ periodId, entries, overrideReason });
  }

  function handleDiscard() {
    setDrafts({});
    setNoteDrafts({});
    mutation.reset();
  }

  if (periodsQuery.isPending || groupsQuery.isPending) {
    return (
      <main aria-busy="true">
        <div className="page-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Loading…</p>
        </div>
      </main>
    );
  }
  if (periodsQuery.isError || groupsQuery.isError) {
    return (
      <main>
        <h1>Evaluate</h1>
        <EmptyState
          tone="danger"
          title="Couldn't load the evaluation page"
          description={(periodsQuery.error ?? groupsQuery.error).message}
        />
      </main>
    );
  }
  if (groups.length === 0) {
    return (
      <main>
        <h1>Evaluate</h1>
        <EmptyState
          title="Create a group first"
          description="Scores are entered per group. Make a group and add students to it, then come back here."
        >
          <p>
            <Link className="btn" to="/groups">
              Go to Groups
            </Link>
          </p>
        </EmptyState>
      </main>
    );
  }
  if (periods.length === 0) {
    return (
      <main>
        <h1>Evaluate</h1>
        <EmptyState
          title="Create a period first"
          description="Scores are entered for a named period. Define one, then come back here."
        >
          <p>
            <Link className="btn" to="/periods">
              Go to Periods
            </Link>
          </p>
        </EmptyState>
      </main>
    );
  }
  let saveLabel = 'Save';
  if (mutation.isPending) {
    saveLabel = 'Saving…';
  } else if (draftCount > 0) {
    saveLabel =
      `Save ${draftCount} change${draftCount === 1 ? '' : 's'}` +
      (lockedCount > 0 ? ` (${lockedCount} locked)` : '');
  }

  return (
    <main className="wide">
      <div className="page-head">
        <h1>Evaluate</h1>
        <div className="page-head-actions">
          <Link className="btn" to="/evaluate/import">
            Import scores
          </Link>
        </div>
      </div>
      <p className="hint">
        Scores are kept separately for each group a student belongs to. Pick the
        group and the period, then fill in the leaf parameters. Parent
        parameters and group roll-ups are worked out for you.
      </p>

      <div className="control-bar">
        <label className="group-filter">
          Group
          <select
            value={groupId}
            onChange={(event) =>
              switchWith(() => setGroupId(event.target.value))
            }
          >
            <option value="">Choose a group…</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {'  '.repeat(group.depth)}
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <label className="group-filter">
          Period
          <select
            value={periodId}
            onChange={(event) =>
              switchWith(() => setPeriodId(event.target.value))
            }
          >
            <option value="">Choose a period…</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </label>
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
          Discard
        </button>
      </div>

      <p className="hint">
        A score can be changed for 7 days after it is first saved (1 day if it
        was entered late). After that it is locked. You can still change it, with
        a written reason, which is recorded in the audit log.
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

      {!ready && (
        <EmptyState
          title="Choose a group and a period"
          description="Pick both above to start entering scores."
        />
      )}
      {ready && matrixQuery.isPending && <p className="hint">Loading…</p>}
      {ready && matrixQuery.isError && (
        <p className="error">{matrixQuery.error.message}</p>
      )}
      {ready && matrix && (
        <EvaluationMatrix
          parameters={matrix.parameters}
          columns={matrix.columns}
          saved={saved}
          savedNotes={savedNotes}
          locks={locks}
          drafts={drafts}
          noteDrafts={noteDrafts}
          cellErrors={cellErrors}
          onCellChange={handleCellChange}
          onNoteChange={handleNoteChange}
          canOverride
        />
      )}
    </main>
  );
}

