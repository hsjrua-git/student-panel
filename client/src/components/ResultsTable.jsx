import { Link } from 'react-router';
import { formatParameterHint, formatStudentCode } from '../lib/format.js';

function SortHeader({ label, sortKey, sort, onSort, className }) {
  const active = sort.key === sortKey;
  const ariaSort = active
    ? sort.direction === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';
  return (
    <th className={className} aria-sort={ariaSort}>
      <button type="button" className="sort" onClick={() => onSort(sortKey)}>
        {label}
        {active ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );
}

function ResultsTable({ rows, columns, stats, sort, onSort }) {
  return (
    <div className="table-wrap">
      <table className="results-table">
        <thead>
          <tr>
            <SortHeader label="Student" sortKey="name" sort={sort} onSort={onSort} />
            <SortHeader label="Code" sortKey="code" sort={sort} onSort={onSort} />
            {columns.map((parameter) => (
              <SortHeader
                key={parameter.id}
                className="num"
                sortKey={parameter.id}
                sort={sort}
                onSort={onSort}
                label={
                  <>
                    {parameter.name}
                    <span className="hint">
                      {' '}
                      {formatParameterHint(parameter)}
                      {parameter.inUse ? '' : ' (not in use)'}
                    </span>
                  </>
                }
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link to={`/students/${row.id}`}>{row.fullName}</Link>
              </td>
              <td className="code">{formatStudentCode(row.studentCode)}</td>
              {columns.map((parameter) => {
                const value = row.values[parameter.id];
                return (
                  <td key={parameter.id} className="num">
                    {value === undefined ? (
                      <span className="muted">—</span>
                    ) : (
                      value
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={2} scope="row">
              Average
            </th>
            {columns.map((parameter) => (
              <td key={parameter.id} className="num">
                {stats[parameter.id]?.average ?? '—'}
              </td>
            ))}
          </tr>
          <tr>
            <th colSpan={2} scope="row">
              Measured
            </th>
            {columns.map((parameter) => (
              <td key={parameter.id} className="num">
                {stats[parameter.id]?.count ?? 0} of {rows.length}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default ResultsTable;