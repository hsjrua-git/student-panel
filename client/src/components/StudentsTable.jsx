import { useQuery } from '@tanstack/react-query';
import { listStudents } from '../api/students.js';
import { formatStudentCode, formatDateTime } from '../lib/format.js';

function StudentsTable() {
  const {
    data: students,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ['students'],
    queryFn: listStudents,
  });

  if (isPending) return <p>Loading students...</p>;
  if (isError) return <p className="error">{error.message}</p>;
  if (students.length === 0) {
    return <p>No students yet. Add the first one above.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Code</th>
          <th>Full name</th>
          <th>Added</th>
        </tr>
      </thead>
      <tbody>
        {students.map((student) => (
          <tr key={student.id}>
            <td className="code">{formatStudentCode(student.studentCode)}</td>
            <td>{student.fullName}</td>
            <td>{formatDateTime(student.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default StudentsTable;