import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { setPeriodAnchor } from '../api/periods.js';
import JalaliDatePicker from '../components/JalaliDatePicker.jsx';
import { formatIsoDate, toIsoDate } from '../lib/format.js';
import { usePeriods } from '../lib/usePeriods.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { errorMessage } from '../i18n/errors.js';

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
  const { t } = useTranslation(['admin', 'common']);
  if (!data.anchorDate) {
    return <p className="hint">{t('settings.noAnchor')}</p>;
  }
  if (data.current === null) {
    return (
      <p className="hint">
        {t('settings.period1Starts', { date: formatIsoDate(data.anchorDate) })}
      </p>
    );
  }
  const currentPeriod = data.periods[data.periods.length - 1];
  return (
    <>
      <div className="stat-card kpi-callout">
        <div className="stat-label">{t('settings.currentPeriod')}</div>
        <div className="stat-value">
          {t('settings.periodValue', { number: data.current })}
        </div>
        <div className="hint">
          {formatIsoDate(currentPeriod.startDate)} –{' '}
          {formatIsoDate(currentPeriod.endDate)}
        </div>
      </div>
      <p className="hint">
        {t('settings.today', { date: formatIsoDate(data.today) })}
      </p>
    </>
  );
}

function AnchorForm({ savedAnchor }) {
  const { t } = useTranslation(['admin', 'common']);
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
      setProblem(t('settings.notSaturday'));
      return;
    }
    setProblem(null);
    mutation.mutate(anchorDate);
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="anchorDate">{t('settings.anchorLabel')}</label>
      <div className="row">
        <JalaliDatePicker
          id="anchorDate"
          value={anchorDate}
          onChange={setAnchorDate}
        />
        <button type="submit" disabled={mutation.isPending}>
          {mutation.isPending
            ? t('common:actions.saving')
            : t('common:actions.save')}
        </button>
      </div>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {mutation.isError && (
        <p className="error" role="alert">
          {errorMessage(mutation.error)}
        </p>
      )}
      {mutation.isSuccess && (
        <p className="success" role="status">
          {t('settings.saved')}
        </p>
      )}
    </form>
  );
}

function SettingsPage() {
  const { t } = useTranslation(['admin', 'common']);
  const { data, isPending, isError, error } = usePeriods();
  const { can } = useAuth();

  return (
    <main>
      <h1>{t('settings.title')}</h1>
      <section className="section-card">
        <h2>{t('settings.periodsTitle')}</h2>
        <p>{t('settings.periodsIntro')}</p>
        {isPending && <p className="hint">{t('common:status.loading')}</p>}
        {isError && <p className="error">{errorMessage(error)}</p>}
        {data && <PeriodSummary data={data} />}
        {data && can('settings.manage') && (
          <AnchorForm savedAnchor={data.anchorDate} />
        )}
        <p className="hint">{t('settings.anchorHint')}</p>
      </section>
    </main>
  );
}

export default SettingsPage;
