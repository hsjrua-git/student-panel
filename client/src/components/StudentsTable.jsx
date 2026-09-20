import { useEffect } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listStudents } from '../api/students.js';
import StudentRow from './StudentRow.jsx';

const PAGE_SIZE = 25;

function StudentsTable({ search, page, onPageChange }) {
  const { data, isPending, isError, error, isPlaceholderData } = useQuery({
    queryKey: ['students', { search, page }],
    queryFn: () => listStudents({ search, page, pageSize: PAGE_SIZE }),
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
          : 'No students yet. Add the first one above.'}
      </p>
    );
  }

  return (
    <>
      <table className={isPlaceholderData ? 'stale' : undefined}>
        <thead>
          <tr>
            <th>Code</th>
            <th>Full name</th>
            <th>Added</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.students.map((student) => (
            <StudentRow key={student.id} student={student} />
          ))}
        </tbody>
      </table>

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