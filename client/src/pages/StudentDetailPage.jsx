import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { listStudentEvaluations } from '../api/evaluations.js';
import { listParameters } from '../api/parameters.js';
import { getStudent } from '../api/students.js';
import { useAuth } from '../auth/AuthContext.jsx';
import ByParameterView from '../components/ByParameterView.jsx';
import ByPeriodView from '../components/ByPeriodView.jsx';
import HistoryGrid from '../components/HistoryGrid.jsx';
import { formatStudentCode } from '../lib/format.js';
import { usePeriods } from '../lib/usePeriods.js';
import { visibleParameters } from '../lib/prefs.js';
import { usePreferences } from '../preferences/PreferencesContext.jsx';
import ExportButton from '../components/ExportButton.jsx';
import StudentFieldsSection from '../components/StudentFieldsSection.jsx';
import StudentGroupsSection from '../components/StudentGroupsSection.jsx';
import StudentEvaluateSection from '../components/StudentEvaluateSection.jsx';
import { historyCsvRows } from '../lib/exports.js';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'period', label: 'By period' },
  { id: 'parameter', label: 'By parameter' },
];

function StudentDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { preferences } = usePreferences();
  const [tab, setTab] = useState(preferences.studentDefaultTab);

  // The score history (all three tabs, plus the CSV export) is evaluations
  // labelled by parameters, so it needs BOTH scores.view and parameters.view.
  // A role that can see students but lacks one of those still gets the
  // student's identity, custom fields and group memberships below — only the
  // History section is hidden, rather than erroring the whole page. This is
  // why the students list can safely link every name: the detail page always
  // renders whatever the role is allowed to see.
  const canViewScores = can('scores.view');
  const canViewParameters = can('parameters.view');
  const canViewHistory = canViewScores && canViewParameters;

  const studentQuery = useQuery({
    queryKey: ['student', id],
    queryFn: () => getStudent(id),
  });
  const evaluationsQuery = useQuery({
    queryKey: ['evaluations', { studentId: id }],
    queryFn: () => listStudentEvaluations(id),
    enabled: canViewScores,
  });
  const parametersQuery = useQuery({
    queryKey: ['parameters'],
    queryFn: listParameters,
    enabled: canViewParameters,
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

  // Only the queries we actually fire gate the page. A query disabled by a
  // missing permission stays `pending` forever (its fetch never starts), so
  // including it here would wedge the page on "Loading..." — instead its
  // dependent section is simply hidden below.
  const queries = [studentQuery, periodsQuery];
  if (canViewScores) queries.push(evaluationsQuery);
  if (canViewParameters) queries.push(parametersQuery);
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

  let content = null;
  if (canViewHistory) {
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
  }

  return (
    <main className="wide">
      {backLink}
      <h1>{student.fullName}</h1>
      <p className="hint code">Code {formatStudentCode(student.studentCode)}</p>
      {can('data.export') && canViewHistory && (
        <p>
          <ExportButton
            label="Export history (CSV)"
            filename={`history-${student.studentCode}.csv`}
            disabled={!periods.anchorDate || periods.current === null}
            buildRows={() =>
              historyCsvRows({
                evaluations,
                periods: periods.periods,
                parameters,
              })
            }
          />
        </p>
      )}

      <StudentFieldsSection student={student} />
      <StudentGroupsSection student={student} />
      <StudentEvaluateSection student={student} />

      {canViewHistory && (
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
      )}
    </main>
  );
}

export default StudentDetailPage;