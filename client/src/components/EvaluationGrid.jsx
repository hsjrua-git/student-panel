import { useEffect } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listStudents } from '../api/students.js';
import { cellAccess, cellKey, savedText } from '../lib/cells.js';
import {
  formatDateTime,
  formatRange,
  formatStudentCode,
} from '../lib/format.js';

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

function EvaluationGrid({
  parameters,
  saved,
  locks,
  drafts,
  cellErrors,
  onCellChange,
  canOverride,
  search,
  page,
  onPageChange,
}) {
  const { data, isPending, isError, error, isPlaceholderData } = useQuery({
    queryKey: ['students', { search, page, pageSize: GRID_PAGE_SIZE }],
    queryFn: () => listStudents({ search, page, pageSize: GRID_PAGE_SIZE }),
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
              <tr key={student.id}>
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
                      </div>
                      {message && <div className="error small">{message}</div>}
                    </td>
                  );
                })}
              </tr>
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