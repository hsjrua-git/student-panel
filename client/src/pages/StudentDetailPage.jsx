import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { listParameters } from '../api/parameters.js';
import { getStudent } from '../api/students.js';
import { listStudentGroups } from '../api/groups.js';
import EmptyState from '../components/EmptyState.jsx';
import { formatStudentCode } from '../lib/format.js';
import { usePeriods } from '../lib/usePeriods.js';
import ExportLink from '../components/ExportLink.jsx';
import StudentFieldsSection from '../components/StudentFieldsSection.jsx';
import StudentGroupsSection from '../components/StudentGroupsSection.jsx';
import StudentEvaluateSection from '../components/StudentEvaluateSection.jsx';
import StudentHistory from '../components/StudentHistory.jsx';

// One student: identity + custom fields, the groups they belong to, in-page
// scoring, and the recorded-score history across those groups. Single operator,
// so there is no permission gating — every section always renders.
function StudentDetailPage() {
  const { id } = useParams();

  const studentQuery = useQuery({
    queryKey: ['student', id],
    queryFn: () => getStudent(id),
  });
  const periodsQuery = usePeriods();
  const parametersQuery = useQuery({
    queryKey: ['parameters'],
    queryFn: () => listParameters(),
  });
  const groupsQuery = useQuery({
    queryKey: ['student-groups', id],
    queryFn: () => listStudentGroups(id),
  });

  const backLink = (
    <p>
      <Link to="/students">← Back to students</Link>
    </p>
  );

  if (studentQuery.isError && studentQuery.error.status === 404) {
    return (
      <main>
        {backLink}
        <EmptyState
          tone="warn"
          title="Student not found"
          description="This student does not exist or was deleted."
        />
      </main>
    );
  }

  const queries = [studentQuery, periodsQuery, parametersQuery, groupsQuery];
  const failed = queries.find((query) => query.isError);
  if (failed) {
    return (
      <main>
        {backLink}
        <EmptyState
          tone="danger"
          title="Couldn't load this student"
          description={failed.error.message}
        />
      </main>
    );
  }
  if (queries.some((query) => query.isPending)) {
    return (
      <main aria-busy="true">
        {backLink}
        <div className="page-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Loading…</p>
        </div>
      </main>
    );
  }

  const student = studentQuery.data;
  const periods = periodsQuery.data;
  const parameters = parametersQuery.data;
  const groups = groupsQuery.data;

  return (
    <main className="wide">
      {backLink}
      <div className="page-head">
        <div>
          <h1>{student.fullName}</h1>
          <p className="hint code">
            Code {formatStudentCode(student.studentCode)}
          </p>
        </div>
        <div className="page-head-actions">
          <ExportLink
            prefill={{ students: { mode: 'selection', ids: [student.id] } }}
          />
        </div>
      </div>

      <StudentFieldsSection student={student} />
      <StudentGroupsSection student={student} />
      <StudentEvaluateSection student={student} />

      <section className="section-card">
        <h2>History</h2>
        <StudentHistory
          student={student}
          groups={groups}
          periods={periods}
          parameters={parameters}
        />
      </section>
    </main>
  );
}

export default StudentDetailPage;
