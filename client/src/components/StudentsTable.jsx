import { useEffect } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listStudents } from '../api/students.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePreferences } from '../preferences/PreferencesContext.jsx';
import StudentRow from './StudentRow.jsx';

function StudentsTable({ search, page, onPageChange, groupId = null }) {
  const { can } = useAuth();
  const { preferences } = usePreferences();
  const pageSize = preferences.studentsPageSize;
  const sort = preferences.studentsSort;

  const { data, isPending, isError, error, isPlaceholderData } = useQuery({
    queryKey: ['students', { search, page, pageSize, sort, groupId }],
    queryFn: () => listStudents({ search, page, pageSize, sort, groupId }),
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
          : can('students.create')
            ? 'No students yet. Add the first one above.'
            : 'No students yet.'}
      </p>
    );
  }

  return (
    <>
      <div className={`table-wrap${isPlaceholderData ? ' stale' : ''}`}>
        <table>
          <thead>
            <tr>
              {preferences.studentsShowCode && <th>Code</th>}
              <th>Full name</th>
              {preferences.studentsShowAdded && <th>Added</th>}
              {(can('students.edit') || can('students.delete')) && (
                <th>Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.students.map((student) => (
              <StudentRow key={student.id} student={student} />
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

export default StudentsTable;