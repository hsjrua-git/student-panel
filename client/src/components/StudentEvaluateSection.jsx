import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listPeriodParameters,
  listStudentEvaluations,
  saveEvaluations,
} from '../api/evaluations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import PeriodPicker from './PeriodPicker.jsx';
import {
  buildEntries,
  buildSavePayload,
  cellAccess,
  cellKey,
  lockedDraftKeys,
  savedText,
} from '../lib/cells.js';
import { formatDateTime, formatRange } from '../lib/format.js';
import { usePeriods } from '../lib/usePeriods.js';

function rangeHint(parameter) {
  const range = formatRange(parameter);
  return [range === '—' ? null : range, parameter.unit].filter(Boolean).join(' · ');
}

function lockTitle(lock, access) {
  if (!lock) return undefined;
  if (lock.isLocked) {
    return access === 'override'
      ? `Locked since ${formatDateTime(lock.lockedAt)}. Changing it needs a written reason.`
      : `Locked since ${formatDateTime(lock.lockedAt)}. Only an administrator can change it.`;
  }
  return `Can be changed until ${formatDateTime(lock.lockedAt)}`;
}

// In-page evaluation for a single student. It mirrors the Evaluate page's save
// flow (drafts → buildSavePayload → PUT /evaluations/bulk, with lock/override
// handling) but scoped to one student and one period, so a teacher can enter
// scores straight from the student's own page. Only rendered for scores.enter.
function StudentEvaluateSection({ student }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const periodsQuery = usePeriods();
  const periods = periodsQuery.data;

  const [chosenPeriod, setChosenPeriod] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [noteDrafts, setNoteDrafts] = useState({});
  const [openNote, setOpenNote] = useState(null);

  const periodNumber = chosenPeriod ?? periods?.current ?? null;
  const canOverride = can('scores.override');

  const parametersQuery = useQuery({
    queryKey: ['period-parameters', periodNumber],
    queryFn: () => listPeriodParameters(periodNumber),
    enabled: periodNumber !== null,
  });
  // Shares the cache with the parent page's history query, so a save here also
  // refreshes the History views below.
  const savedQuery = useQuery({
    queryKey: ['evaluations', { studentId: student.id }],
    queryFn: () => listStudentEvaluations(student.id),
  });

  const forPeriod = useMemo(
    () => (savedQuery.data ?? []).filter((row) => row.periodNumber === periodNumber),
    [savedQuery.data, periodNumber]
  );
  const saved = useMemo(
    () =>
      Object.fromEntries(
        forPeriod.map((item) => [cellKey(item.studentId, item.parameterId), item.value])
      ),
    [forPeriod]
  );
  const savedNotes = useMemo(
    () =>
      Object.fromEntries(
        forPeriod
          .filter((item) => item.comment != null)
          .map((item) => [cellKey(item.studentId, item.parameterId), item.comment])
      ),
    [forPeriod]
  );
  const locks = useMemo(
    () =>
      Object.fromEntries(
        forPeriod.map((item) => [
          cellKey(item.studentId, item.parameterId),
          { isLocked: item.isLocked, lockedAt: item.lockedAt },
        ])
      ),
    [forPeriod]
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

  if (!can('scores.enter')) return null;

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

  function handleCellChange(key, text, original) {
    if (!mutation.isIdle) mutation.reset();
    setDrafts((current) => {
      const next = { ...current };
      if (text.trim() === original) delete next[key];
      else next[key] = text;
      return next;
    });
  }

  function handleNoteChange(key, text, originalNote) {
    if (!mutation.isIdle) mutation.reset();
    setNoteDrafts((current) => {
      const next = { ...current };
      if (text === originalNote) delete next[key];
      else next[key] = text;
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
    setNoteDrafts({});
    setOpenNote(null);
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

  let saveLabel = 'Save';
  if (mutation.isPending) {
    saveLabel = 'Saving...';
  } else if (draftCount > 0) {
    saveLabel =
      `Save ${draftCount} change${draftCount === 1 ? '' : 's'}` +
      (lockedCount > 0 ? ` (${lockedCount} locked)` : '');
  }

  return (
    <section>
      <h2>Evaluate</h2>

      {periodsQuery.isPending && <p>Loading...</p>}
      {periodsQuery.isError && (
        <p className="error">{periodsQuery.error.message}</p>
      )}

      {periods && !periods.anchorDate && (
        <p className="hint">Set the period start date first, on the Settings page.</p>
      )}
      {periods && periods.anchorDate && periods.current === null && (
        <p className="hint">Period 1 has not started yet.</p>
      )}

      {periods && periods.anchorDate && periods.current !== null && (
        <>
          <PeriodPicker
            periods={periods}
            value={periodNumber}
            onChange={handlePeriodChange}
          />

          <div className="toolbar">
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
            A score can be changed for 7 days after it is first saved (1 day if
            it was entered late). After that it is locked
            {canOverride
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

          {(parametersQuery.isPending || savedQuery.isPending) && <p>Loading...</p>}
          {parametersQuery.isError && (
            <p className="error">{parametersQuery.error.message}</p>
          )}
          {savedQuery.isError && (
            <p className="error">{savedQuery.error.message}</p>
          )}

          {parametersQuery.data && savedQuery.data && (
            parametersQuery.data.length === 0 ? (
              <p>No parameters are used in this period.</p>
            ) : (
              <EvaluateTable
                parameters={parametersQuery.data}
                studentId={student.id}
                saved={saved}
                savedNotes={savedNotes}
                locks={locks}
                drafts={drafts}
                noteDrafts={noteDrafts}
                cellErrors={cellErrors}
                canOverride={canOverride}
                openNote={openNote}
                onOpenNoteChange={setOpenNote}
                onCellChange={handleCellChange}
                onNoteChange={handleNoteChange}
              />
            )
          )}
        </>
      )}
    </section>
  );
}

function EvaluateTable({
  parameters,
  studentId,
  saved,
  savedNotes,
  locks,
  drafts,
  noteDrafts,
  cellErrors,
  canOverride,
  openNote,
  onOpenNoteChange,
  onCellChange,
  onNoteChange,
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Score</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {parameters.map((parameter) => {
            const key = cellKey(studentId, parameter.id);
            const original = savedText(saved[key]);
            const shown = drafts[key] ?? original;
            const message = cellErrors[key];
            const lock = locks[key];
            const access = cellAccess(lock, canOverride);
            const classes = [
              'cell',
              key in drafts ? 'changed' : '',
              message ? 'invalid' : '',
              access !== 'open' ? 'locked' : '',
            ]
              .filter(Boolean)
              .join(' ');

            const originalNote = savedNotes[key] ?? '';
            const shownNote = key in noteDrafts ? noteDrafts[key] : originalNote;
            const hasNote = shownNote.trim() !== '';
            const isNoteOpen = openNote === key;

            return (
              <tr key={parameter.id}>
                <td>
                  {parameter.name}
                  <div className="hint">{rangeHint(parameter)}</div>
                </td>
                <td>
                  <div className="cell-wrap">
                    <input
                      className={classes}
                      inputMode="decimal"
                      value={shown}
                      disabled={access === 'locked'}
                      title={lockTitle(lock, access)}
                      onChange={(event) =>
                        onCellChange(key, event.target.value, original)
                      }
                      aria-label={`${parameter.name}${lock?.isLocked ? ' (locked)' : ''}`}
                      autoComplete="off"
                    />
                    {access !== 'open' && (
                      <span className="lock" aria-hidden="true">
                        🔒
                      </span>
                    )}
                  </div>
                  {message && <div className="error small">{message}</div>}
                </td>
                <td>
                  <button
                    type="button"
                    className={`note-toggle${hasNote ? ' has-note' : ''}${
                      key in noteDrafts ? ' changed' : ''
                    }`}
                    aria-label={`${hasNote ? 'Edit' : 'Add'} note for ${parameter.name}`}
                    aria-expanded={isNoteOpen}
                    title={hasNote ? shownNote : 'Add a note'}
                    onClick={() => onOpenNoteChange(isNoteOpen ? null : key)}
                  >
                    {hasNote ? '📝' : '🗒'}
                  </button>
                  {isNoteOpen && (
                    <textarea
                      className="cell-note"
                      rows={2}
                      maxLength={500}
                      value={shownNote}
                      disabled={access === 'locked'}
                      placeholder="Note (e.g. absent, injured)…"
                      aria-label={`Note for ${parameter.name}`}
                      onChange={(event) =>
                        onNoteChange(key, event.target.value, originalNote)
                      }
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default StudentEvaluateSection;
