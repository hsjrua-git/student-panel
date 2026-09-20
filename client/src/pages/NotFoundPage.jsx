import { Link } from 'react-router';

function NotFoundPage() {
  return (
    <main>
      <h1>Page not found</h1>
      <p>
        <Link to="/students">Go to the students list</Link>
      </p>
    </main>
  );
}

export default NotFoundPage;