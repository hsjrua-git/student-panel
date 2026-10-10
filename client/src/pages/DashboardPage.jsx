import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { getMatrix } from '../api/evaluations.js';
import { getTrends } from '../api/dashboard.js';
import { listGroups } from '../api/groups.js';
import CohortHero from '../components/CohortHero.jsx';
import CohortDrawer from '../components/CohortDrawer.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ParameterDrawer from '../components/ParameterDrawer.jsx';
import StudentDrawer from '../components/StudentDrawer.jsx';
import UnmeasuredList from '../components/UnmeasuredList.jsx';
import {
  cohortField,
  matrixToCohort,
  parameterStats,
  studentBreakdown,
  summarize,
  trendSeries,
  unmeasuredStudents,
} from '../lib/dashboard.js';
import { formatIsoDate } from '../lib/format.js';
import { usePeriods } from '../lib/usePeriods.js';

const EMPTY = [];

// The same indented, tree-ordered group list the Evaluate and Results pages use.
function orderGroups(groups) {
  const byParent = new Map();
  for (const group of groups) {
    const key = group.parentId ?? 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(group);
  }
  const walk = (parentKey, depth) =>
    (byParent.get(parentKey) ?? []).flatMap((group) => [
      { ...group, depth },
      ...walk(group.id, depth + 1),
    ]);
  return walk('root', 0);
}

// The dashboard for one group within one period. Scores are per group, so a group
// and a period must both be chosen before the hero appears; the matrix for that
// pair feeds the cohort aggregates (summary, field, stats, unmeasured) that the
// glowing hero and its three drawers render. The parameter drawer's trend line
// comes from the group's full history (GET /api/dashboard/trends), which spans
// every data-carrying period, not just the selected one.
function DashboardPage() {
  const periodsQuery = usePeriods();
  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: () => listGroups(),
  });

  const [groupId, setGroupId] = useState('');
  const [periodId, setPeriodId] = useState('');
  // Which detail drawer is open: {type:'parameter'|'student'|'cohort', id?} or
  // null. All three drawers stay mounted so their slide-in/out is pure CSS;
  // closing just clears the target and each panel keeps its last content until it
  // is off-screen.
  const [openTarget, setOpenTarget] = useState(null);
  const closeDrawer = useCallback(() => setOpenTarget(null), []);

  const periods = periodsQuery.data ?? EMPTY;
  const groups = useMemo(
    () => orderGroups(groupsQuery.data ?? []),
    [groupsQuery.data]
  );
  const ready = groupId !== '' && periodId !== '';

  const matrixQuery = useQuery({
    queryKey: ['matrix', { groupId, periodId }],
    queryFn: () => getMatrix({ groupId, periodId }),
    enabled: ready,
  });
  const trendsQuery = useQuery({
    queryKey: ['trends', { groupId }],
    queryFn: () => getTrends({ groupId }),
    enabled: groupId !== '',
  });

  const cohort = useMemo(
    () => matrixToCohort(matrixQuery.data),
    [matrixQuery.data]
  );
  const summary = useMemo(() => summarize(cohort), [cohort]);
  const field = useMemo(() => cohortField(cohort), [cohort]);
  const stats = useMemo(() => parameterStats(cohort), [cohort]);
  const unmeasured = useMemo(() => unmeasuredStudents(cohort), [cohort]);

  const selectedGroup = groups.find((group) => group.id === groupId) ?? null;
  const selectedPeriod =
    periods.find((period) => period.id === periodId) ?? null;
  const groupName = selectedGroup?.name ?? null;
  const periodName = selectedPeriod?.name ?? null;

  if (periodsQuery.isPending || groupsQuery.isPending) {
    return (
      <main aria-busy="true">
        <div className="page-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Loading…</p>
        </div>
      </main>
    );
  }
  if (periodsQuery.isError || groupsQuery.isError) {
    return (
      <main>
        <h1>Dashboard</h1>
        <EmptyState
          tone="danger"
          title="Couldn't load the dashboard"
          description={(periodsQuery.error ?? groupsQuery.error).message}
        />
      </main>
    );
  }
  if (groups.length === 0) {
    return (
      <main>
        <h1>Dashboard</h1>
        <EmptyState
          title="Create a group first"
          description="Scores are kept per group. Make a group and add students to it, then the dashboard will light up here."
        >
          <p>
            <Link className="btn" to="/groups">
              Go to Groups
            </Link>
          </p>
        </EmptyState>
      </main>
    );
  }
  if (periods.length === 0) {
    return (
      <main>
        <h1>Dashboard</h1>
        <EmptyState
          title="Create a period first"
          description="The dashboard shows one named period. Define one, then come back here."
        >
          <p>
            <Link className="btn" to="/periods">
              Go to Periods
            </Link>
          </p>
        </EmptyState>
      </main>
    );
  }

  const matrix = matrixQuery.data;

  // The open drawer's data, derived from the unified target. Only one type is ever
  // active at a time; the others resolve to null so their (always-mounted) drawer
  // renders its cached content while closed. The trend is computed only when a
  // parameter is actually selected.
  const openParamId = openTarget?.type === 'parameter' ? openTarget.id : null;
  const openStat =
    openParamId !== null
      ? stats.find((stat) => stat.parameter.id === openParamId) ?? null
      : null;
  const openTrend = openStat
    ? trendSeries({ trends: trendsQuery.data, parameterId: openParamId })
    : EMPTY;
  const openStudent =
    openTarget?.type === 'student' && matrix
      ? studentBreakdown(cohort, openTarget.id)
      : null;
  const openCohort = openTarget?.type === 'cohort' ? summary : null;

  return (
    <main className="wide">
      <div className="page-head">
        <h1>Dashboard</h1>
        <div className="page-head-actions">
          <Link className="btn primary" to="/evaluate">
            Enter scores
          </Link>
        </div>
      </div>

      <div className="control-bar">
        <label className="group-filter">
          Group
          <select
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
          >
            <option value="">Choose a group…</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {'  '.repeat(group.depth)}
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <label className="group-filter">
          Period
          <select
            value={periodId}
            onChange={(event) => setPeriodId(event.target.value)}
          >
            <option value="">Choose a period…</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!ready && (
        <EmptyState
          title="Choose a group and a period"
          description="Pick both above to see how that group is doing this period."
        />
      )}

      {ready && matrixQuery.isPending && (
        <p className="hint" role="status" aria-live="polite">
          Loading…
        </p>
      )}
      {ready && matrixQuery.isError && (
        <EmptyState
          tone="danger"
          title="Couldn't load this group's scores"
          description={matrixQuery.error.message}
        />
      )}

      {ready && matrix && (
        <>
          <p className="summary-line">
            <strong>{groupName}</strong> · {periodName}
            {selectedPeriod && (
              <>
                {' '}
                ({formatIsoDate(selectedPeriod.startDate)} –{' '}
                {formatIsoDate(selectedPeriod.endDate)})
              </>
            )}
          </p>

          {summary.students === 0 ? (
            <EmptyState
              title="No students in this group"
              description="Add students to this group to start entering and reviewing scores."
            >
              <p>
                <Link to="/groups">Go to Groups</Link>
              </p>
            </EmptyState>
          ) : summary.parametersInUse === 0 ? (
            <EmptyState
              title="Nothing to measure yet"
              description="No parameters are defined, so there is nothing to score for this group."
            >
              <p>
                <Link to="/parameters">Go to Parameters</Link>
              </p>
            </EmptyState>
          ) : (
            <>
              <CohortHero
                summary={summary}
                field={field}
                stats={stats}
                onSelect={setOpenTarget}
              />

              <section>
                <h2>Needs scoring</h2>
                <UnmeasuredList items={unmeasured} />
              </section>
            </>
          )}
        </>
      )}

      <ParameterDrawer
        open={openTarget?.type === 'parameter' && Boolean(openStat)}
        stat={openStat}
        trend={openTrend}
        trendError={trendsQuery.isError ? trendsQuery.error.message : null}
        onClose={closeDrawer}
      />
      <StudentDrawer
        open={openTarget?.type === 'student' && Boolean(openStudent)}
        breakdown={openStudent}
        onClose={closeDrawer}
      />
      <CohortDrawer
        open={openTarget?.type === 'cohort' && Boolean(openCohort)}
        summary={openCohort}
        onClose={closeDrawer}
      />
    </main>
  );
}

export default DashboardPage;
