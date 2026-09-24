import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setPeriodAnchor } from '../api/periods.js';
import { formatIsoDate, toIsoDate } from '../lib/format.js';
import { usePeriods } from '../lib/usePeriods.js';
import { useAuth } from '../auth/AuthContext.jsx';

function lastSaturday() {
  const date = new Date();
  date.setDate(date.getDate() - ((date.getDay() + 1) % 7));
  return toIsoDate(date);
}

function isSaturday(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).getDay() === 6;
}

function PeriodSummary({ data }) {
  if (!data.anchorDate) {
    return <p className="hint">No start date is set yet. Pick one below to begin.</p>;
  }
  if (data.current === null) {
    return <p className="hint">Period 1 starts on {formatIsoDate(data.anchorDate)}.</p>;
  }
  const currentPeriod = data.periods[data.periods.length - 1];
  return (
    <>
      <div className="stat-card kpi-callout">
        <div className="stat-label">Current period</div>
        <div className="stat-value">Period {data.current}</div>
        <div className="hint">
          {formatIsoDate(currentPeriod.startDate)} –{' '}
          {formatIsoDate(currentPeriod.endDate)}
        </div>
      </div>
      <p className="hint">Today is {formatIsoDate(data.today)}.</p>
    </>
  );
}

function AnchorForm({ savedAnchor }) {
  const queryClient = useQueryClient();
  const [anchorDate, setAnchorDate] = useState(savedAnchor ?? lastSaturday());
  const [problem, setProblem] = useState(null);

  const mutation = useMutation({
    mutationFn: setPeriodAnchor,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['periods'] }),
  });

  function handleSubmit(event) {
    event.preventDefault();
    if (!anchorDate || !isSaturday(anchorDate)) {
      mutation.reset();
      setProblem('Please pick a Saturday.');
      return;
    }
    setProblem(null);
    mutation.mutate(anchorDate);
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="anchorDate">First day of Period 1 (a Saturday)</label>
      <div className="row">
        <input
          id="anchorDate"
          type="date"
          value={anchorDate}
          onChange={(event) => setAnchorDate(event.target.value)}
        />
        <button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {mutation.isError && (
        <p className="error" role="alert">
          {mutation.error.message}
        </p>
      )}
      {mutation.isSuccess && (
        <p className="success" role="status">
          Saved.
        </p>
      )}
    </form>
  );
}

function SettingsPage() {
  const { data, isPending, isError, error } = usePeriods();
  const { can } = useAuth();

  return (
    <main>
      <h1>Settings</h1>
      <section className="section-card">
        <h2>Periods</h2>
        <p>
          Evaluations are grouped into periods. Each period is one week, from
          Saturday to Friday, numbered from Period 1. Period 1 starts on the
          date below.
        </p>
        {isPending && <p className="hint">Loading…</p>}
        {isError && <p className="error">{error.message}</p>}
        {data && <PeriodSummary data={data} />}
        {data && can('settings.manage') && (
          <AnchorForm savedAnchor={data.anchorDate} />
        )}
        <p className="hint">
          The start date can only be changed until the first score is saved,
          because changing it would move every saved score to a different week.
        </p>
      </section>
    </main>
  );
}

export default SettingsPage;