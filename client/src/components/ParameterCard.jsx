import { useId } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { distribution } from '../lib/dashboard.js';
import { CHART_TOOLTIP } from '../lib/chartTheme.js';
import { formatChange, formatParameterHint } from '../lib/format.js';

const AXIS = { fill: 'currentColor', fontSize: 11 };
const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };

function ParameterCard({ stat, trend }) {
  const gradientId = useId();
  const { parameter } = stat;
  const bins = distribution(stat.values, parameter);
  const trendData = trend.map((point) => ({
    label: `P${point.periodNumber}`,
    average: point.average,
  }));
  const hasTrend = trend.some((point) => point.average !== null);
  const hint = formatParameterHint(parameter);

  return (
    <article className="param-card">
      <h3>
        {parameter.name}
        {hint && <span className="hint"> {hint}</span>}
      </h3>
      {!parameter.inUse && (
        <p className="hint">Not in use this period, but scores exist.</p>
      )}

      {stat.count === 0 ? (
        <p>No scores in this period yet.</p>
      ) : (
        <p className="summary">
          Average <strong>{stat.average}</strong> · Lowest {stat.min} · Highest{' '}
          {stat.max} · {stat.count} measured
          {stat.averageChange !== null && (
            <>
              {' '}
              · <strong>{formatChange(stat.averageChange)}</strong> vs previous
              period ({stat.paired} student{stat.paired === 1 ? '' : 's'}{' '}
              measured both times)
            </>
          )}
        </p>
      )}

      {hasTrend && (
        <>
          <h4>Class average over time</h4>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={trendData} margin={MARGIN}>
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
              <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" />
              <YAxis
                domain={[parameter.minValue ?? 'auto', parameter.maxValue ?? 'auto']}
                tick={AXIS}
                width={32}
              />
              <Tooltip {...CHART_TOOLTIP} cursor={{ strokeDasharray: '3 3' }} />
              <Area
                type="linear"
                dataKey="average"
                name="Class average"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                fillOpacity={1}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}

      {stat.count > 0 && bins.length > 0 && (
        <>
          <h4>How scores are spread</h4>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={bins} margin={MARGIN}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={AXIS} />
              <YAxis allowDecimals={false} tick={AXIS} width={28} />
              <Tooltip {...CHART_TOOLTIP} />
              <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </article>
  );
}

export default ParameterCard;