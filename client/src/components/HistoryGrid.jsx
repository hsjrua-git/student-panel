import { useMemo, useState } from 'react';
import { formatParameterHint, formatShortIsoDate } from '../lib/format.js';
import { buildHistory, visibleRows } from '../lib/history.js';

function Cell({ cell }) {
  if (cell.state === 'value') {
    return <td className="num">{cell.value}</td>;
  }
  if (cell.state === 'missing') {
    return (
      <td className="num muted" title="In use, but not measured">
        —
      </td>
    );
  }
  return (
    <td className="num na" title="Not used in this period">
      n/a
    </td>
  );
}

function HistoryGrid({
  evaluations,
  periods,
  parameters,
  initialShowAll = false,
}) {
  const [showAll, setShowAll] = useState(initialShowAll);

  const history = useMemo(
    () => buildHistory({ evaluations, periods, parameters }),
    [evaluations, periods, parameters]
  );
  const rows = useMemo(
    () => [...visibleRows(history.rows, evaluations, showAll)].reverse(),
    [history.rows, evaluations, showAll]
  );

  if (history.columns.length === 0) {
    return <p>No parameters are in use yet. Add some on the Parameters page.</p>;
  }
  if (rows.length === 0) return <p>No periods have started yet.</p>;

  return (
    <>
      <label className="inline">
        <input
          type="checkbox"
          checked={showAll}
          onChange={(event) => setShowAll(event.target.checked)}
        />
        Show all periods
      </label>
      <p className="hint">
        Periods before the first score are hidden. "—" means the parameter was
        in use but not measured. "n/a" means it was not used that period.
      </p>

      <div className="table-wrap">
        <table className="history">
          <thead>
            <tr>
              <th>Period</th>
              {history.columns.map((parameter) => (
                <th key={parameter.id} className="num">
                  {parameter.name}
                  <div className="hint">{formatParameterHint(parameter)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.periodNumber}>
                <th scope="row">
                  Period {row.periodNumber}
                  <div className="hint">
                    {formatShortIsoDate(row.startDate)} –{' '}
                    {formatShortIsoDate(row.endDate)}
                  </div>
                </th>
                {history.columns.map((parameter) => (
                  <Cell key={parameter.id} cell={row.cells[parameter.id]} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default HistoryGrid;