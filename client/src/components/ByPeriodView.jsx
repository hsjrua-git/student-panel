import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChange } from '../lib/format.js';
import { periodView } from '../lib/views.js';
import PeriodPicker from './PeriodPicker.jsx';

function Meter({ percent }) {
  if (percent === null) return null;
  return (
    <div className="meter" aria-hidden="true">
      <div className="meter-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

function ByPeriodView({ evaluations, periods, parameters }) {
  const { t } = useTranslation(['reports', 'common']);
  const [chosen, setChosen] = useState(null);

  const scoredPeriods = evaluations.map((item) => item.periodNumber);
  const defaultPeriod =
    scoredPeriods.length > 0 ? Math.max(...scoredPeriods) : periods.current;
  const periodNumber = chosen ?? defaultPeriod;

  const rows = periodView({
    periodNumber,
    evaluations,
    periods: periods.periods,
    parameters,
  });

  return (
    <>
      <PeriodPicker periods={periods} value={periodNumber} onChange={setChosen} />

      {rows.length === 0 ? (
        <p>{t('byPeriod.empty', { number: periodNumber })}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('shared.parameter')}</th>
                <th className="num">{t('shared.score')}</th>
                <th>{t('byPeriod.withinRange')}</th>
                <th className="num">{t('byPeriod.changeVsPrevious')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.parameter.id}>
                  <td>
                    {row.parameter.name}
                    {!row.inUse && (
                      <span className="hint">
                        {t('byPeriod.notUsedSuffix')}
                      </span>
                    )}
                  </td>
                  <td className="num">{row.value === null ? '—' : row.value}</td>
                  <td>
                    <Meter percent={row.percent} />
                  </td>
                  <td className="num">{formatChange(row.change)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default ByPeriodView;