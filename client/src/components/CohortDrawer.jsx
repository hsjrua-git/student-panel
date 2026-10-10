import { useId, useState } from 'react';
import { CloseIcon } from './icons.jsx';
import Drawer from './Drawer.jsx';

// The whole-class summary behind the glowing core: the headline completion and
// the roster breakdown (the same figures the KPI strip and the field colours
// encode). Read straight from the already-computed summary — no chart, just the
// numbers, since this is the overview the core stands in for at rest. Opened by
// clicking the core or its focusable "Class summary" control.
function CohortBody({ summary, titleId, onClose }) {
  const {
    completion,
    students,
    parametersInUse,
    measured,
    expected,
    studentsComplete,
    studentsPartial,
    studentsNone,
  } = summary;

  const rows = [
    { key: 'full', label: 'Fully measured', value: studentsComplete },
    { key: 'partial', label: 'Partly measured', value: studentsPartial },
    { key: 'none', label: 'Not started', value: studentsNone },
  ];

  return (
    <>
      <header className="drawer-head">
        <h2 id={titleId} className="drawer-title">
          Class summary
        </h2>
        <button
          type="button"
          className="drawer-close"
          onClick={onClose}
          aria-label="Close"
        >
          <CloseIcon size={18} />
        </button>
      </header>

      <p className="summary">
        {completion === null ? (
          'Nothing measured this period yet.'
        ) : (
          <>
            <strong>{completion}%</strong> of expected scores recorded — {measured}{' '}
            of {expected} across {students} student{students === 1 ? '' : 's'} and{' '}
            {parametersInUse} parameter{parametersInUse === 1 ? '' : 's'} in use.
          </>
        )}
      </p>

      <table>
        <thead>
          <tr>
            <th scope="col">Students</th>
            <th scope="col">{students}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">
                <span className={`kpi-swatch ${row.key}`} aria-hidden="true" />{' '}
                {row.label}
              </th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function CohortDrawer({ open, summary, onClose }) {
  const titleId = useId();
  // Same slide-out cache as the other drawers: keep the last summary rendered
  // while the panel closes. The guard settles in one extra render and never loops.
  const [cached, setCached] = useState(null);
  if (summary && cached !== summary) setCached(summary);
  const view = summary ?? cached;

  return (
    <Drawer open={open} titleId={titleId} onClose={onClose}>
      {view && <CohortBody summary={view} titleId={titleId} onClose={onClose} />}
    </Drawer>
  );
}

export default CohortDrawer;
