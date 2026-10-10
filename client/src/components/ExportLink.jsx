import { Link } from 'react-router';

// Warm the Export Center chunk before the click. A bare dynamic import fills the
// same module cache that App's React.lazy importer reuses, so navigation after a
// hover/focus renders the page without a loading flash.
function preload() {
  import('../pages/ExportPage.jsx');
}

// A deep-link into the Export Center that carries the current page's scope as a
// partial config through react-router location state. The Export page reads it
// via useLocation().state?.export → mergePrefill, which deep-merges the scope
// slices onto the defaults and normalises the result — so a partial prefill
// (only the slices this page knows) is enough. Single-operator: always shown.
function ExportLink({ prefill, label = 'Open in Export Center' }) {
  return (
    <Link
      className="btn"
      to="/export"
      state={{ export: prefill }}
      onMouseEnter={preload}
      onFocus={preload}
    >
      {label}
    </Link>
  );
}

export default ExportLink;
