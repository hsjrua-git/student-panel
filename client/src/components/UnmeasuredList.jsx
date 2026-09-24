import { Link } from 'react-router';
import { formatStudentCode } from '../lib/format.js';

const SHOWN = 20;

function UnmeasuredList({ items }) {
  if (items.length === 0) {
    return <p>Every student has a score for every parameter in use.</p>;
  }

  return (
    <>
      <ul className="plain-list unmeasured">
        {items.slice(0, SHOWN).map((item) => (
          <li key={item.id}>
            <div className="unmeasured-head">
              <Link to={`/students/${item.id}`}>{item.fullName}</Link>{' '}
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
      </ul>
      {items.length > SHOWN && (
        <p className="hint">…and {items.length - SHOWN} more.</p>
      )}
    </>
  );
}

export default UnmeasuredList;