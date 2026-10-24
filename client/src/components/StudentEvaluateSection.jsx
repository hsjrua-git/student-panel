import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  listPeriodParameters,
  listStudentEvaluations,
  saveEvaluations,
} from '../api/evaluations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { errorMessage } from '../i18n/errors.js';
import PeriodPicker from './PeriodPicker.jsx';
import { LockIcon, NoteFilledIcon, NoteIcon } from './icons.jsx';
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

function lockTitle(t, lock, access) {
  if (!lock) return undefined;
  if (lock.isLocked) {
    return access === 'override'
      ? t('evaluate.lockedSinceOverride', { date: formatDateTime(lock.lockedAt) })
      : t('evaluate.lockedSinceAdmin', { date: formatDateTime(lock.lockedAt) });
  }
  return t('evaluate.changeableUntil', { date: formatDateTime(lock.lockedAt) });
}

// In-page evaluation for a single student. It mirrors the Evaluate page's save
// flow (drafts → buildSavePayload → PUT /evaluations/bulk, with lock/override
// handling) but scoped to one student and one period, so a teacher can enter
// scores straight from the student's own page. Only rendered for scores.enter.
function StudentEvaluateSection({ student }) {
  const { t } = useTranslation(['students', 'common']);
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
  // Rules of hooks force these queries to run before the `scores.enter` early
  // return below, so gate them on the permission too — otherwise a viewer who
  // opens a student page fires /api/periods/:n/parameters and the evaluations
  // fetch needlessly (and the former would 403 without the server-side gate).
  const canEnter = can('scores.enter');

  const parametersQuery = useQuery({
    queryKey: ['period-parameters', periodNumber],
    queryFn: () => listPeriodParameters(periodNumber),
    enabled: canEnter && periodNumber !== null,
  });
  // Shares the cache with the parent page's history query, so a save here also
  // refreshes the History views below.
  const savedQuery = useQuery({
    queryKey: ['evaluations', { studentId: student.id }],
    queryFn: () => listStudentEvaluations(student.id),
    enabled: canEnter,
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

  if (!canEnter) return null;

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
      !window.confirm(t('evaluate.unsavedConfirm'))
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
    <section className="section-card">
      <h2>{t('evaluate.title')}</h2>

      {periodsQuery.isPending && <p>{t('common:status.loading')}</p>}
      {periodsQuery.isError && (
        <p className="error">{errorMessage(periodsQuery.error)}</p>
      )}

      {periods && !periods.anchorDate && (
        <p className="hint">{t('evaluate.setPeriodFirst')}</p>
      )}
      {periods && periods.anchorDate && periods.current === null && (
        <p className="hint">{t('shared.period1NotStarted')}</p>
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
              {t('evaluate.discard')}
            </button>
          </div>

          <p className="hint">
            {t('evaluate.lockHint')}
            {canOverride
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

          {(parametersQuery.isPending || savedQuery.isPending) && (
            <p>{t('common:status.loading')}</p>
          )}
          {parametersQuery.isError && (
            <p className="error">{errorMessage(parametersQuery.error)}</p>
          )}
          {savedQuery.isError && (
            <p className="error">{errorMessage(savedQuery.error)}</p>
          )}

          {parametersQuery.data && savedQuery.data && (
            parametersQuery.data.length === 0 ? (
              <p>{t('evaluate.noPeriodParameters')}</p>
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
  const { t } = useTranslation(['students', 'common']);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t('evaluate.colParameter')}</th>
            <th>{t('evaluate.colScore')}</th>
            <th>{t('common:table.note')}</th>
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
                      title={lockTitle(t, lock, access)}
                      onChange={(event) =>
                        onCellChange(key, event.target.value, original)
                      }
                      aria-label={
                        parameter.name +
                        (lock?.isLocked ? t('evaluate.lockedTag') : '')
                      }
                      autoComplete="off"
                    />
                    {access !== 'open' && (
                      <span className="lock" aria-hidden="true">
                        <LockIcon />
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
                    aria-label={
                      (hasNote
                        ? t('common:actions.edit')
                        : t('common:actions.add')) +
                      ' ' +
                      t('evaluate.noteForSingle', { parameter: parameter.name })
                    }
                    aria-expanded={isNoteOpen}
                    title={hasNote ? shownNote : t('evaluate.addNoteTitle')}
                    onClick={() => onOpenNoteChange(isNoteOpen ? null : key)}
                  >
                    {hasNote ? <NoteFilledIcon /> : <NoteIcon />}
                  </button>
                  {isNoteOpen && (
                    <textarea
                      className="cell-note"
                      rows={2}
                      maxLength={500}
                      value={shownNote}
                      disabled={access === 'locked'}
                      placeholder={t('evaluate.notePlaceholder')}
                      aria-label={t('evaluate.noteAriaSingle', {
                        parameter: parameter.name,
                      })}
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
