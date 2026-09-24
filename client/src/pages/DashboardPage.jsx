import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { getTrends } from '../api/dashboard.js';
import { getResults } from '../api/results.js';
import { useAuth } from '../auth/AuthContext.jsx';
import GroupFilter from '../components/GroupFilter.jsx';
import HeadlineCards from '../components/HeadlineCards.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ParameterCard from '../components/ParameterCard.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import UnmeasuredList from '../components/UnmeasuredList.jsx';
import {
  parameterStats,
  summarize,
  trendSeries,
  unmeasuredStudents,
} from '../lib/dashboard.js';
import { formatIsoDate } from '../lib/format.js';
import { usePeriods } from '../lib/usePeriods.js';

function DashboardPage() {
  const { can } = useAuth();
  const periodsQuery = usePeriods();
  const periods = periodsQuery.data;
  const [chosen, setChosen] = useState(null);
  const [groupId, setGroupId] = useState('');
  const periodNumber = chosen ?? periods?.current ?? null;

  const resultsQuery = useQuery({
    queryKey: ['results', periodNumber, groupId],
    queryFn: () => getResults(periodNumber, groupId || null),
    enabled: periodNumber !== null,
  });
  const trendsQuery = useQuery({
    queryKey: ['trends', groupId],
    queryFn: () => getTrends(groupId || null),
  });

  const results = resultsQuery.data;
  const summary = useMemo(() => (results ? summarize(results) : null), [results]);
  const stats = useMemo(() => (results ? parameterStats(results) : []), [results]);
  const unmeasured = useMemo(
    () => (results ? unmeasuredStudents(results) : []),
    [results]
  );

  if (periodsQuery.isPending) {
    return (
      <main aria-busy="true">
        <div className="page-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Loading…</p>
        </div>
      </main>
    );
  }
  if (periodsQuery.isError) {
    return (
      <main>
        <EmptyState
          tone="danger"
          title="Couldn't load the dashboard"
          description={periodsQuery.error.message}
        />
      </main>
    );
  }
  if (!periods.anchorDate) {
    return (
      <main>
        <h1>Dashboard</h1>
        {can('settings.manage') ? (
          <EmptyState
            title="Set up the calendar"
            description="Set the period start date to begin tracking scores."
          >
            <p>
              <Link to="/settings">Go to Settings</Link>
            </p>
          </EmptyState>
        ) : (
          <EmptyState
            title="Not set up yet"
            description="An administrator needs to set the period start date first."
          />
        )}
      </main>
    );
  }
  if (periods.current === null) {
    return (
      <main>
        <h1>Dashboard</h1>
        <EmptyState
          title="Period 1 hasn't started"
          description="Once the first period begins, results will show up here."
        />
      </main>
    );
  }

  const upToSelected = periods.periods.filter(
    (period) => period.number <= periodNumber
  );

  return (
    <main className="wide">
      <div className="page-head">
        <h1>Dashboard</h1>
        {can('scores.enter') && periodNumber === periods.current && (
          <div className="page-head-actions">
            <Link className="btn primary" to="/evaluate">
              Enter scores
            </Link>
          </div>
        )}
      </div>

      <div className="toolbar">
        <PeriodPicker
          periods={periods}
          value={periodNumber}
          onChange={setChosen}
        />
        <GroupFilter value={groupId} onChange={setGroupId} />
      </div>

      {resultsQuery.isPending && <p className="hint">Loading…</p>}
      {resultsQuery.isError && (
        <p className="error">{resultsQuery.error.message}</p>
      )}

      {results && (
        <>
          <p className="summary-line">
            Period {results.periodNumber} ({formatIsoDate(results.startDate)} –{' '}
            {formatIsoDate(results.endDate)})
          </p>
          {results.truncated && (
            <p className="hint">
              Only the first {results.students.length} of {results.total}{' '}
              students are included.
            </p>
          )}

          {results.students.length === 0 ? (
            <EmptyState
              title="No students yet"
              description="Add students to start entering and reviewing scores."
            >
              {can('students.create') && (
                <p>
                  <Link to="/students">Go to Students</Link>
                </p>
              )}
            </EmptyState>
          ) : results.parameters.length === 0 ? (
            <EmptyState
              title="Nothing measured this period"
              description="No parameters were used in this period, and no scores were entered yet."
            />
          ) : (
            <>
              <HeadlineCards summary={summary} />

              <section>
                <h2>Parameters</h2>
                {trendsQuery.isError && (
                  <p className="hint">
                    The history charts could not be loaded:{' '}
                    {trendsQuery.error.message}
                  </p>
                )}
                <div className="param-grid">
                  {stats.map((stat) => (
                    <ParameterCard
                      key={stat.parameter.id}
                      stat={stat}
                      trend={trendSeries({
                        trends: trendsQuery.data ?? [],
                        periods: upToSelected,
                        parameterId: stat.parameter.id,
                      })}
                    />
                  ))}
                </div>
              </section>

              <section>
                <h2>Not yet measured</h2>
                <UnmeasuredList items={unmeasured} />
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}

export default DashboardPage;