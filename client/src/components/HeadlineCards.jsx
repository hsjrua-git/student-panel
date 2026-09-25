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
  const plural = summary.parametersInUse === 1 ? '' : 's';
  const allMeasured =
    summary.students > 0 && summary.studentsComplete === summary.students;
  return (
    <div className="stat-grid">
      <Card
        label="Students"
        value={<CountUp value={summary.students} />}
        note={`${summary.parametersInUse} parameter${plural} in use`}
      />
      <Card
        label="Scores entered"
        value={
          summary.completion === null ? (
            '—'
          ) : (
            <CountUp value={summary.completion} suffix="%" />
          )
        }
        note={`${summary.measured} of ${summary.expected}`}
      />
      <Card
        label="Fully measured"
        value={<CountUp value={summary.studentsComplete} />}
        note={`of ${summary.students} students`}
        tone={allMeasured ? 'ok' : undefined}
      />
      <Card
        label="Not measured at all"
        value={<CountUp value={summary.studentsNone} />}
        note={
          summary.studentsPartial > 0
            ? `${summary.studentsPartial} partly measured`
            : undefined
        }
        tone={summary.studentsNone > 0 ? 'danger' : undefined}
      />
    </div>
  );
}

export default HeadlineCards;