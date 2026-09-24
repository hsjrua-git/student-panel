import { Link } from 'react-router';
import EmptyState from '../components/EmptyState.jsx';

function CompassIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="9" />
      <path
        d="m15.5 8.5-2 5-5 2 2-5 5-2Z"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NotFoundPage() {
  return (
    <main>
      <EmptyState
        icon={<CompassIcon />}
        title="Page not found"
        description="That page doesn't exist or may have moved."
      >
        <Link className="btn primary" to="/students">
          Go to the students list
        </Link>
      </EmptyState>
    </main>
  );
}

export default NotFoundPage;
