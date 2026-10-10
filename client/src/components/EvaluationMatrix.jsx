import { memo, useState } from 'react';
import { cellAccess, cellKey, savedText } from '../lib/cells.js';
import {
  formatDateTime,
  formatParameterHint,
  formatStudentCode,
} from '../lib/format.js';
import { LockIcon, NoteFilledIcon, NoteIcon } from './icons.jsx';

function normHint({ normMin, normMax }) {
  if (normMin === null && normMax === null) return null;
  if (normMin !== null && normMax !== null) {
    return normMin === normMax ? `norm ${normMin}` : `norm ${normMin}–${normMax}`;
  }
  return normMin !== null ? `norm ≥ ${normMin}` : `norm ≤ ${normMax}`;
}

function rowHint(parameter) {
  return [formatParameterHint(parameter), normHint(parameter)]
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
// One parameter's row across every column of the matrix (the group's own score
// plus one column per member). Wrapped in React.memo (see rowsEqual) so typing
// in a cell re-renders only that parameter's row, not the whole grid.
const MatrixRow = memo(function MatrixRow({
  parameter,
  columns,
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
      <th scope="row" className="row-head">
        {parameter.name}
        {rowHint(parameter) && <div className="hint">{rowHint(parameter)}</div>}
      </th>
      {columns.map((column) => {
        const key = cellKey(column.studentId, parameter.id);
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
          <td key={column.key}>
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
                aria-label={`${parameter.name} for ${column.label}${
                  lock?.isLocked ? ' (locked)' : ''
                }`}
                autoComplete="off"
              />
              {access !== 'open' && (
                <span className="lock" aria-hidden="true">
                  <LockIcon />
                </span>
              )}
              <button
                type="button"
                className={`note-toggle${hasNote ? ' has-note' : ''}${
                  noteChanged ? ' changed' : ''
                }`}
                aria-label={`${hasNote ? 'Edit' : 'Add'} note for ${
                  parameter.name
                }, ${column.label}`}
                aria-expanded={isNoteOpen}
                title={hasNote ? shownNote : 'Add a note'}
                onClick={() => onOpenNoteChange(isNoteOpen ? null : key)}
              >
                {hasNote ? <NoteFilledIcon /> : <NoteIcon />}
              </button>
            </div>
            {isNoteOpen && (
              <textarea
                className="cell-note"
                rows={2}
                maxLength={500}
                value={shownNote}
                disabled={access === 'locked'}
                placeholder="Note (e.g. absent, injured)…"
                aria-label={`Note for ${parameter.name}, ${column.label}`}
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
// keystroke, so for those we compare just this row's own cells.
function rowsEqual(prev, next) {
  if (
    prev.parameter !== next.parameter ||
    prev.columns !== next.columns ||
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
  const parameterId = next.parameter.id;
  for (const column of next.columns) {
    const key = cellKey(column.studentId, parameterId);
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
// The matrix is scoped to one group + one period. Rows are the leaf parameters;
// columns are the group's own score followed by one column per member. The
// server supplies `columns` (first entry kind:'group'), so this is pure render.
export default function EvaluationMatrix({
  parameters,
  columns,
  saved,
  savedNotes = {},
  locks,
  drafts,
  noteDrafts = {},
  cellErrors,
  onCellChange,
  onNoteChange,
  canOverride,
}) {
  const [openNote, setOpenNote] = useState(null);

  if (parameters.length === 0) {
    return (
      <p className="hint">
        No leaf parameters to score. Add parameters on the Parameters page.
      </p>
    );
  }

  return (
    <div className="table-wrap">
      <table className="grid matrix">
        <thead>
          <tr>
            <th>Parameter</th>
            {columns.map((column) => (
              <th
                key={column.key}
                className={column.kind === 'group' ? 'group-col' : undefined}
              >
                {column.label}
                {column.kind === 'group' ? (
                  <div className="hint">group’s own</div>
                ) : (
                  column.studentCode && (
                    <div className="hint code">
                      {formatStudentCode(column.studentCode)}
                    </div>
                  )
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parameters.map((parameter) => (
            <MatrixRow
              key={parameter.id}
              parameter={parameter}
              columns={columns}
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
  );
}

