import { memo, useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listStudents } from '../api/students.js';
import { cellAccess, cellKey, savedText } from '../lib/cells.js';
import {
  formatDateTime,
  formatRange,
  formatStudentCode,
} from '../lib/format.js';
import { usePreferences } from '../preferences/PreferencesContext.jsx';

const GRID_PAGE_SIZE = 50;

function rangeHint(parameter) {
  const range = formatRange(parameter);
  return [range === '—' ? null : range, parameter.unit]
    .filter(Boolean)
    .join(' · ');
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

// One student's row. It is wrapped in React.memo (see rowsEqual) so that typing
// in a cell only re-renders the row that changed, not the whole 50×N grid — the
// difference between one input updating and hundreds re-rendering per keystroke.
const EvaluationRow = memo(function EvaluationRow({
  student,
  parameters,
  saved,
  savedNotes,
  locks,
  drafts,
  noteDrafts,
  cellErrors,
  onCellChange,
  onNoteChange,
  canOverride,
  openNote,
  onOpenNoteChange,
}) {
  return (
    <tr>
      <td>
        {student.fullName}
        <div className="hint code">
          {formatStudentCode(student.studentCode)}
        </div>
      </td>
      {parameters.map((parameter) => {
        const key = cellKey(student.id, parameter.id);
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
        const noteChanged = key in noteDrafts;
        const isNoteOpen = openNote === key;

        return (
          <td key={parameter.id}>
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
                aria-label={`${parameter.name} for ${student.fullName}${
                  lock?.isLocked ? ' (locked)' : ''
                }`}
                autoComplete="off"
              />
              {access !== 'open' && (
                <span className="lock" aria-hidden="true">
                  🔒
                </span>
              )}
              {onNoteChange && (
                <button
                  type="button"
                  className={`note-toggle${hasNote ? ' has-note' : ''}${
                    noteChanged ? ' changed' : ''
                  }`}
                  aria-label={`${hasNote ? 'Edit' : 'Add'} note for ${
                    parameter.name
                  }, ${student.fullName}`}
                  aria-expanded={isNoteOpen}
                  title={hasNote ? shownNote : 'Add a note'}
                  onClick={() => onOpenNoteChange(isNoteOpen ? null : key)}
                >
                  {hasNote ? '📝' : '🗒'}
                </button>
              )}
            </div>
            {onNoteChange && isNoteOpen && (
              <textarea
                className="cell-note"
                rows={2}
                maxLength={500}
                value={shownNote}
                disabled={access === 'locked'}
                placeholder="Note (e.g. absent, injured)…"
                aria-label={`Note for ${parameter.name}, ${student.fullName}`}
                onChange={(event) =>
                  onNoteChange(key, event.target.value, originalNote)
                }
              />
            )}
            {message && <div className="error small">{message}</div>}
          </td>
        );
      })}
    </tr>
  );
}, rowsEqual);

// Custom equality for a row. The shared objects (saved/savedNotes/locks) are
// rebuilt together only when the server data refetches, so their reference is a
// reliable signal. The draft maps and the open-note key change on every
// keystroke, so for those we compare just this row's own cells and skip the
// re-render when none of them moved.
function rowsEqual(prev, next) {
  if (
    prev.student !== next.student ||
    prev.parameters !== next.parameters ||
    prev.canOverride !== next.canOverride ||
    prev.onCellChange !== next.onCellChange ||
    prev.onNoteChange !== next.onNoteChange ||
    prev.onOpenNoteChange !== next.onOpenNoteChange ||
    prev.saved !== next.saved ||
    prev.savedNotes !== next.savedNotes ||
    prev.locks !== next.locks
  ) {
    return false;
  }

  const openChanged = prev.openNote !== next.openNote;
  const studentId = next.student.id;
  for (const parameter of next.parameters) {
    const key = cellKey(studentId, parameter.id);
    if (
      prev.drafts[key] !== next.drafts[key] ||
      prev.noteDrafts[key] !== next.noteDrafts[key] ||
      prev.cellErrors[key] !== next.cellErrors[key]
    ) {
      return false;
    }
    if (openChanged && (prev.openNote === key || next.openNote === key)) {
      return false;
    }
  }
  return true;
}

function EvaluationGrid({
  parameters,
  saved,
  savedNotes = {},
  locks,
  drafts,
  noteDrafts = {},
  cellErrors,
  onCellChange,
  onNoteChange,
  canOverride,
  search,
  page,
  onPageChange,
  groupId = null,
}) {
  const { preferences } = usePreferences();
  const sort = preferences.studentsSort;
  const [openNote, setOpenNote] = useState(null);

  const { data, isPending, isError, error, isPlaceholderData } = useQuery({
    queryKey: ['students', { search, page, pageSize: GRID_PAGE_SIZE, sort, groupId }],
    queryFn: () =>
      listStudents({ search, page, pageSize: GRID_PAGE_SIZE, sort, groupId }),
    placeholderData: keepPreviousData,
  });

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  useEffect(() => {
    if (data && page > totalPages) onPageChange(totalPages);
  }, [data, page, totalPages, onPageChange]);

  if (isPending) return <p>Loading students...</p>;
  if (isError) return <p className="error">{error.message}</p>;
  if (data.total === 0) {
    return (
      <p>
        {search
          ? `No students match "${search}".`
          : 'No students yet. Add some on the Students page.'}
      </p>
    );
  }
  if (parameters.length === 0) {
    return (
      <p>
        No parameters are used in this period. Check the change history on the
        Parameters page.
      </p>
    );
  }

  return (
    <>
      <div className="table-wrap">
        <table className={`grid${isPlaceholderData ? ' stale' : ''}`}>
          <thead>
            <tr>
              <th>Student</th>
              {parameters.map((parameter) => (
                <th key={parameter.id}>
                  {parameter.name}
                  <div className="hint">{rangeHint(parameter)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.students.map((student) => (
              <EvaluationRow
                key={student.id}
                student={student}
                parameters={parameters}
                saved={saved}
                savedNotes={savedNotes}
                locks={locks}
                drafts={drafts}
                noteDrafts={noteDrafts}
                cellErrors={cellErrors}
                onCellChange={onCellChange}
                onNoteChange={onNoteChange}
                canOverride={canOverride}
                openNote={openNote}
                onOpenNoteChange={setOpenNote}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages} ({data.total} students)
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </div>
    </>
  );
}

export default EvaluationGrid;
