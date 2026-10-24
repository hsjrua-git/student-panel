import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_TOOLTIP } from '../lib/chartTheme.js';
import { formatChange, formatShortIsoDate } from '../lib/format.js';
import { buildHistory } from '../lib/history.js';
import { parameterView } from '../lib/views.js';

function ByParameterView({ evaluations, periods, parameters }) {
  const { t } = useTranslation(['reports', 'common']);
  const [chosenId, setChosenId] = useState(null);
  const gradientId = useId();

  const list = periods.periods;
  const columns = useMemo(
    () => buildHistory({ evaluations, periods: list, parameters }).columns,
    [evaluations, list, parameters]
  );

  if (columns.length === 0) {
    return <p>{t('shared.noParametersYet')}</p>;
  }

  const inUseNow = new Set(list[list.length - 1]?.parameterIds ?? []);
  const scoredIds = new Set(evaluations.map((item) => item.parameterId));
  const defaultId = (columns.find((c) => scoredIds.has(c.id)) ?? columns[0]).id;
  const parameterId = columns.some((c) => c.id === chosenId)
    ? chosenId
    : defaultId;
  const parameter = columns.find((c) => c.id === parameterId);

  const { points, stats } = parameterView({
    parameterId,
    evaluations,
    periods: list,
  });
  const chartData = points.map((point) => ({
    label: t('shared.periodNumber', { number: point.periodNumber }),
    value: point.value,
  }));

  return (
    <>
      <label className="inline">
        {t('shared.parameter')}
        <select
          value={parameterId}
          onChange={(event) => setChosenId(event.target.value)}
        >
          {columns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
              {inUseNow.has(column.id) ? '' : t('byParameter.notInUseNow')}
            </option>
          ))}
        </select>
      </label>

      {!stats ? (
        <p>{t('byParameter.noScores', { name: parameter.name })}</p>
      ) : (
        <>
          <p className="summary">
            {t('byParameter.latest')} <strong>{stats.latest.value}</strong>{' '}
            {t('byParameter.inPeriod', { number: stats.latest.periodNumber })} ·{' '}
            {t('charts.averageLabel')} <strong>{stats.average}</strong>
            {stats.change !== null && (
              <>
                {' '}
                · {t('byParameter.sinceFirst')}{' '}
                <strong>{formatChange(stats.change)}</strong>
              </>
            )}{' '}
            · {t('byParameter.scoreCount', { count: stats.count })}
          </p>

          <div className="chart-box">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      style={{ stopColor: 'var(--brand)', stopOpacity: 0.26 }}
                    />
                    <stop
                      offset="100%"
                      style={{ stopColor: 'var(--brand)', stopOpacity: 0 }}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'currentColor', fontSize: 12 }}
                />
                <YAxis
                  domain={[parameter.minValue ?? 'auto', parameter.maxValue ?? 'auto']}
                  tick={{ fill: 'currentColor', fontSize: 12 }}
                  width={40}
                />
                <Tooltip {...CHART_TOOLTIP} cursor={{ strokeDasharray: '3 3' }} />
                <Area
                  type="linear"
                  dataKey="value"
                  name={parameter.name}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  fillOpacity={1}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('shared.period')}</th>
                  <th>{t('byParameter.dates')}</th>
                  <th className="num">{t('shared.score')}</th>
                </tr>
              </thead>
              <tbody>
                {[...points].reverse().map((point) => (
                  <tr key={point.periodNumber}>
                    <td>{t('shared.periodNumber', { number: point.periodNumber })}</td>
                    <td>
                      {formatShortIsoDate(point.startDate)} –{' '}
                      {formatShortIsoDate(point.endDate)}
                    </td>
                    <td className="num">
                      {point.value === null ? '—' : point.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

export default ByParameterView;