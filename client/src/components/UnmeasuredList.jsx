import { Link } from 'react-router';
import { formatStudentCode } from '../lib/format.js';

const SHOWN = 20;

// The dashboard's "who to score next" queue. unmeasuredStudents() hands these
// over worst-first (most missing parameters first), so the rail reads left to
// right as a work order: the students furthest from complete sit at the front.
// A horizontal rail keeps the glowing hero the page's vertical focus instead of
// a long list pushing everything down.
function UnmeasuredList({ items }) {
  if (items.length === 0) {
    return (
      <p className="needs-clear">
        Every student has a score for every parameter in use.
      </p>
    );
  }

  const shown = items.slice(0, SHOWN);
  const rest = items.length - shown.length;

  return (
    <>
      <p className="hint">
        {items.length} student{items.length === 1 ? '' : 's'} still need a score
        {items.length > 1 ? ' — most incomplete first' : ''}.
      </p>
      <ul className="needs-rail">
        {shown.map((item) => (
          <li key={item.id} className="needs-ticket">
            <div className="needs-ticket-head">
              <Link to={`/students/${item.id}`} className="needs-name">
                {item.fullName}
              </Link>
              <span className="hint code">
                {formatStudentCode(item.studentCode)}
              </span>
            </div>
            <span className="chip-row">
              {item.missing.map((name) => (
                <span key={name} className="chip warn">
                  {name}
                </span>
              ))}
            </span>
          </li>
        ))}
        {rest > 0 && (
          <li className="needs-ticket needs-more" aria-hidden="true">
            +{rest} more
          </li>
        )}
      </ul>
    </>
  );
}

export default UnmeasuredList;
