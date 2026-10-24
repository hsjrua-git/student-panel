import { useTranslation } from 'react-i18next';
import CountUp from './CountUp.jsx';

function Card({ label, value, note, tone }) {
  return (
    <div className={tone ? `stat-card ${tone}` : 'stat-card'}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="hint">{note}</div>}
    </div>
  );
}

function HeadlineCards({ summary }) {
  const { t } = useTranslation(['reports', 'common']);
  const allMeasured =
    summary.students > 0 && summary.studentsComplete === summary.students;
  return (
    <div className="stat-grid">
      <Card
        label={t('headlineCards.students')}
        value={<CountUp value={summary.students} />}
        note={t('headlineCards.parametersInUse', {
          count: summary.parametersInUse,
        })}
      />
      <Card
        label={t('headlineCards.scoresEntered')}
        value={
          summary.completion === null ? (
            '—'
          ) : (
            <CountUp value={summary.completion} suffix="%" />
          )
        }
        note={t('headlineCards.ofExpected', {
          measured: summary.measured,
          expected: summary.expected,
        })}
      />
      <Card
        label={t('headlineCards.fullyMeasured')}
        value={<CountUp value={summary.studentsComplete} />}
        note={t('headlineCards.ofStudents', { count: summary.students })}
        tone={allMeasured ? 'ok' : undefined}
      />
      <Card
        label={t('headlineCards.notMeasuredAtAll')}
        value={<CountUp value={summary.studentsNone} />}
        note={
          summary.studentsPartial > 0
            ? t('headlineCards.partlyMeasured', {
                count: summary.studentsPartial,
              })
            : undefined
        }
        tone={summary.studentsNone > 0 ? 'danger' : undefined}
      />
    </div>
  );
}

export default HeadlineCards;