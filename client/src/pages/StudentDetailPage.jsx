import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { listStudentEvaluations } from '../api/evaluations.js';
import { listParameters } from '../api/parameters.js';
import { getStudent } from '../api/students.js';
import ByParameterView from '../components/ByParameterView.jsx';
import ByPeriodView from '../components/ByPeriodView.jsx';
import HistoryGrid from '../components/HistoryGrid.jsx';
import { formatStudentCode } from '../lib/format.js';
import { usePeriods } from '../lib/usePeriods.js';
import { visibleParameters } from '../lib/prefs.js';
import { usePreferences } from '../preferences/PreferencesContext.jsx';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'period', label: 'By period' },
  { id: 'parameter', label: 'By parameter' },
];

function StudentDetailPage() {
  const { id } = useParams();
  const { preferences } = usePreferences();
  const [tab, setTab] = useState(preferences.studentDefaultTab);

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
  const evaluations = evaluationsQuery.data;
  const parameters = parametersQuery.data;

  let content;
  if (!periods.anchorDate) {
    content = (
      <p>
        Set the period start date first, on the{' '}
        <Link to="/settings">Settings</Link> page.
      </p>
    );
  } else if (periods.current === null) {
    content = <p>Period 1 has not started yet.</p>;
  } else if (tab === 'period') {
    content = (
      <ByPeriodView
        evaluations={evaluations}
        periods={periods}
        parameters={parameters}
      />
    );
  } else if (tab === 'parameter') {
    content = (
      <ByParameterView
        evaluations={evaluations}
        periods={periods}
        parameters={parameters}
      />
    );
  } else {
    const shown = visibleParameters(parameters, preferences.hiddenParameterIds);
    content = (
      <>
        <HistoryGrid
          evaluations={evaluations}
          periods={periods.periods}
          parameters={shown}
          initialShowAll={preferences.studentShowAllPeriods}
        />
        {shown.length < parameters.length && (
          <p className="hint">
            Some parameters are hidden in this overview. Change this in{' '}
            <Link to="/preferences">Preferences</Link>.
          </p>
        )}
      </>
    );
  }

  return (
    <main className="wide">
      {backLink}
      <h1>{student.fullName}</h1>
      <p className="hint code">Code {formatStudentCode(student.studentCode)}</p>

      <section>
        <h2>History</h2>
        <div className="tabs" role="tablist" aria-label="History views">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? 'tab active' : 'tab'}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {content}
      </section>
    </main>
  );
}

export default StudentDetailPage;