import { Link } from 'react-router';
import EmptyState from '../components/EmptyState.jsx';

// The unified Export Center is being rebuilt for the per-group scoring model
// (a student is scored separately inside each group, so a single cross-group
// "cube" no longer describes the data). Until that lands, exports live next to
// the data they cover, where the group/period context is unambiguous. This page
// is the signpost to those, so nothing is silently lost.
const SOURCES = [
  {
    to: '/results',
    title: 'Results',
    description:
      'Scores for one group and period, with the per-parameter table and chart — export as CSV from the Results page.',
  },
  {
    to: '/students',
    title: 'A student’s history',
    description:
      'Every recorded score for one student across all their groups — open a student and use “Export history (CSV)”.',
  },
  {
    to: '/dashboard',
    title: 'Dashboard',
    description:
      'The summary figures and trend charts for the current selection export from the Dashboard.',
  },
  {
    to: '/audit',
    title: 'Audit log',
    description:
      'The append-only record of every change — filter it on the Audit page and export the view.',
  },
];

function ExportPage() {
  return (
    <main className="wide">
      <div className="page-head">
        <div>
          <h1>Export</h1>
          <p className="hint">
            Export lives next to each kind of data while the unified Export
            Center is rebuilt for per-group scoring. Pick a source below.
          </p>
        </div>
      </div>

      <EmptyState
        title="Where to export from"
        description="Each page exports the slice it shows, with its group and period already in context."
      />

      <div className="card-grid">
        {SOURCES.map((source) => (
          <Link key={source.to} to={source.to} className="section-card link-card">
            <h2>{source.title}</h2>
            <p className="hint">{source.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}

export default ExportPage;
