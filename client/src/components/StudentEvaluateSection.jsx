import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMatrix, saveEvaluations } from '../api/evaluations.js';
import { listStudentGroups } from '../api/groups.js';
import EvaluationMatrix from './EvaluationMatrix.jsx';
import {
  buildEntries,
  buildSavePayload,
  cellKey,
  lockedDraftKeys,
} from '../lib/cells.js';
import { usePeriods } from '../lib/usePeriods.js';

// In-page scoring for one student. Scores are kept per group, so the operator
// picks which of the student's groups and which period to score, then edits
// just this student's column of that group's matrix. The save flow mirrors the
// Evaluate page (drafts -> buildSavePayload -> PUT /evaluations/bulk, with lock
// and override handling).
export default function StudentEvaluateSection({ student }) {
  const queryClient = useQueryClient();
  const periodsQuery = usePeriods();
  const groupsQuery = useQuery({
    queryKey: ['student-groups', student.id],
    queryFn: () => listStudentGroups(student.id),
  });

  const periods = periodsQuery.data ?? [];
  const groups = groupsQuery.data ?? [];

  const [groupId, setGroupId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [drafts, setDrafts] = useState({});
  const [noteDrafts, setNoteDrafts] = useState({});

  const ready = groupId !== '' && periodId !== '';
  const matrixQuery = useQuery({
    queryKey: ['matrix', { groupId, periodId }],
    queryFn: () => getMatrix({ groupId, periodId }),
    enabled: ready,
  });
  const matrix = matrixQuery.data;

  // Show only this student's column of the group matrix.
  const columns = useMemo(() => {
    const column = (matrix?.columns ?? []).find(
      (c) => c.studentId === student.id,
    );
    return column ? [column] : [];
  }, [matrix, student.id]);

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
  // referentially stable (the memoized MatrixRow relies on that).
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

  let saveLabel = 'Save';
  if (mutation.isPending) {
    saveLabel = 'Saving…';
  } else if (draftCount > 0) {
    saveLabel =
      `Save ${draftCount} change${draftCount === 1 ? '' : 's'}` +
      (lockedCount > 0 ? ` (${lockedCount} locked)` : '');
  }

  return (
    <section className="section-card">
      <h2>Evaluate</h2>
      <p className="hint">
        Scores are kept separately for each group this student belongs to. Pick
        a group and a period, then fill in the leaf parameters.
      </p>

      {(periodsQuery.isPending || groupsQuery.isPending) && (
        <p className="hint">Loading…</p>
      )}
      {periodsQuery.isError && (
        <p className="error">{periodsQuery.error.message}</p>
      )}
      {groupsQuery.isError && (
        <p className="error">{groupsQuery.error.message}</p>
      )}

      {!periodsQuery.isPending &&
        !groupsQuery.isPending &&
        !periodsQuery.isError &&
        !groupsQuery.isError &&
        (groups.length === 0 ? (
          <p className="hint">
            Add this student to a group to score them — scores are kept per
            group.
          </p>
        ) : periods.length === 0 ? (
          <p className="hint">Create a period first, on the Periods page.</p>
        ) : (
          <>
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
              A score can be changed for 7 days after it is first saved (1 day
              if it was entered late). After that it is locked; you can still
              change it, with a written reason, which is recorded in the audit
              log.
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
              <p className="hint">
                Pick a group and a period to start entering scores.
              </p>
            )}
            {ready && matrixQuery.isPending && (
              <p className="hint">Loading…</p>
            )}
            {ready && matrixQuery.isError && (
              <p className="error">{matrixQuery.error.message}</p>
            )}
            {ready && matrix && columns.length === 0 && (
              <p className="hint">
                This student is not a member of the selected group.
              </p>
            )}
            {ready && matrix && columns.length > 0 && (
              <EvaluationMatrix
                parameters={matrix.parameters}
                columns={columns}
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
          </>
        ))}
    </section>
  );
}
