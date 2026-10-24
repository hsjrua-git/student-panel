import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatParameterHint, formatShortIsoDate } from '../lib/format.js';
import { buildHistory, visibleRows } from '../lib/history.js';

function Cell({ cell }) {
  const { t } = useTranslation(['reports', 'common']);
  if (cell.state === 'value') {
    return <td className="num">{cell.value}</td>;
  }
  if (cell.state === 'missing') {
    return (
      <td className="num muted" title={t('history.inUseNotMeasured')}>
        —
      </td>
    );
  }
  return (
    <td className="num na" title={t('shared.notUsedThisPeriod')}>
      {t('history.na')}
    </td>
  );
}

function HistoryGrid({
  evaluations,
  periods,
  parameters,
  initialShowAll = false,
}) {
  const { t } = useTranslation(['reports', 'common']);
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
    return <p>{t('shared.noParametersYet')}</p>;
  }
  if (rows.length === 0) return <p>{t('history.noPeriods')}</p>;

  return (
    <>
      <label className="inline">
        <input
          type="checkbox"
          checked={showAll}
          onChange={(event) => setShowAll(event.target.checked)}
        />
        {t('history.showAll')}
      </label>
      <p className="hint">{t('history.legend')}</p>

      <div className="table-wrap">
        <table className="history">
          <thead>
            <tr>
              <th>{t('shared.period')}</th>
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
                  {t('shared.periodNumber', { number: row.periodNumber })}
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