import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatChange, formatShortIsoDate } from '../lib/format.js';
import { buildHistory } from '../lib/history.js';
import { parameterView } from '../lib/views.js';

function ByParameterView({ evaluations, periods, parameters }) {
  const [chosenId, setChosenId] = useState(null);

  const list = periods.periods;
  const columns = useMemo(
    () => buildHistory({ evaluations, periods: list, parameters }).columns,
    [evaluations, list, parameters]
  );

  if (columns.length === 0) {
    return <p>No parameters are in use yet. Add some on the Parameters page.</p>;
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
    label: `P${point.periodNumber}`,
    value: point.value,
  }));

  return (
    <>
      <label className="inline">
        Parameter
        <select
          value={parameterId}
          onChange={(event) => setChosenId(event.target.value)}
        >
          {columns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
              {inUseNow.has(column.id) ? '' : ' (not in use now)'}
            </option>
          ))}
        </select>
      </label>

      {!stats ? (
        <p>No scores for {parameter.name} yet.</p>
      ) : (
        <>
          <p className="summary">
            Latest <strong>{stats.latest.value}</strong> (Period{' '}
            {stats.latest.periodNumber}) · Average{' '}
            <strong>{stats.average}</strong>
            {stats.change !== null && (
              <>
                {' '}
                · Since first score <strong>{formatChange(stats.change)}</strong>
              </>
            )}{' '}
            · {stats.count} score{stats.count === 1 ? '' : 's'}
          </p>

          <div className="chart-box">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  stroke="rgba(128,128,128,0.3)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'currentColor', fontSize: 12 }}
                />
                <YAxis
                  domain={[parameter.minValue ?? 'auto', parameter.maxValue ?? 'auto']}
                  tick={{ fill: 'currentColor', fontSize: 12 }}
                  width={40}
                />
                <Tooltip />
                <Line
                  type="linear"
                  dataKey="value"
                  name={parameter.name}
                  stroke="#4f46e5"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Dates</th>
                  <th className="num">Score</th>
                </tr>
              </thead>
              <tbody>
                {[...points].reverse().map((point) => (
                  <tr key={point.periodNumber}>
                    <td>Period {point.periodNumber}</td>
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