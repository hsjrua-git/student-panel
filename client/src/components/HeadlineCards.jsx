function Card({ label, value, note }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="hint">{note}</div>}
    </div>
  );
}

function HeadlineCards({ summary }) {
  const plural = summary.parametersInUse === 1 ? '' : 's';
  return (
    <div className="stat-grid">
      <Card
        label="Students"
        value={summary.students}
        note={`${summary.parametersInUse} parameter${plural} in use`}
      />
      <Card
        label="Scores entered"
        value={summary.completion === null ? '—' : `${summary.completion}%`}
        note={`${summary.measured} of ${summary.expected}`}
      />
      <Card
        label="Fully measured"
        value={summary.studentsComplete}
        note={`of ${summary.students} students`}
      />
      <Card
        label="Not measured at all"
        value={summary.studentsNone}
        note={
          summary.studentsPartial > 0
            ? `${summary.studentsPartial} partly measured`
            : undefined
        }
      />
    </div>
  );
}

export default HeadlineCards;