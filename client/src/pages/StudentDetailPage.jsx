import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { listStudentEvaluations } from '../api/evaluations.js';
import { listParameters } from '../api/parameters.js';
import { getStudent } from '../api/students.js';
import HistoryGrid from '../components/HistoryGrid.jsx';
import { formatStudentCode } from '../lib/format.js';
import { usePeriods } from '../lib/usePeriods.js';

function StudentDetailPage() {
  const { id } = useParams();

  const studentQuery = useQuery({
    queryKey: ['student', id],
    queryFn: () => getStudent(id),
  });
  const evaluationsQuery = useQuery({
    queryKey: ['evaluations', { studentId: id }],
    queryFn: () => listStudentEvaluations(id),
  });
  const parametersQuery = useQuery({
    queryKey: ['parameters'],
    queryFn: listParameters,
  });
  const periodsQuery = usePeriods();

  const backLink = (
    <p>
      <Link to="/students">← Back to students</Link>
    </p>
  );

  if (studentQuery.isError && studentQuery.error.status === 404) {
    return (
      <main>
        {backLink}
        <h1>Student not found</h1>
        <p>This student does not exist or was deleted.</p>
      </main>
    );
  }

  const queries = [
    studentQuery,
    evaluationsQuery,
    parametersQuery,
    periodsQuery,
  ];
  const failed = queries.find((query) => query.isError);
  if (failed) {
    return (
      <main>
        {backLink}
        <p className="error">{failed.error.message}</p>
      </main>
    );
  }
  if (queries.some((query) => query.isPending)) {
    return (
      <main>
        {backLink}
        <p>Loading...</p>
      </main>
    );
  }

  const student = studentQuery.data;
  const periods = periodsQuery.data;

  return (
    <main className="wide">
      {backLink}
      <h1>{student.fullName}</h1>
      <p className="hint code">Code {formatStudentCode(student.studentCode)}</p>

      <section>
        <h2>History</h2>
        {!periods.anchorDate ? (
          <p>
            Set the period start date first, on the{' '}
            <Link to="/settings">Settings</Link> page.
          </p>
        ) : (
          <HistoryGrid
            evaluations={evaluationsQuery.data}
            periods={periods.periods}
            parameters={parametersQuery.data}
          />
        )}
      </section>
    </main>
  );
}

export default StudentDetailPage;