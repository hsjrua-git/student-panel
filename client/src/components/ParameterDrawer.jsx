import { useId, useState } from 'react';
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
import { CloseIcon } from './icons.jsx';
import Drawer from './Drawer.jsx';

const AXIS = { fill: 'currentColor', fontSize: 11 };
const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };

// The full picture for one parameter: the summary line plus the trend and
// distribution charts that used to sit in a grid of cards below the hero. Those
// charts are detail, not overview, so they live behind a click on the parameter's
// satellite — the dashboard stays a single glowing object, and the depth opens on
// demand. Focus is trapped while open, Escape and the scrim close it, and focus
// returns to the satellite that opened it (handled in the effect's cleanup).
function DrawerBody({ stat, trend, trendError, titleId, onClose }) {
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
    <>
      <header className="drawer-head">
        <h2 id={titleId} className="drawer-title">
          {parameter.name}
          {hint && <span className="hint"> {hint}</span>}
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
          <h3 className="drawer-chart-title">Class average over time</h3>
          <ResponsiveContainer width="100%" height={170}>
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

      {!hasTrend && trendError && (
        <p className="hint">The history chart could not be loaded: {trendError}</p>
      )}

      {stat.count > 0 && bins.length > 0 && (
        <>
          <h3 className="drawer-chart-title">How scores are spread</h3>
          <ResponsiveContainer width="100%" height={170}>
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
    </>
  );
}

function ParameterDrawer({ open, stat, trend = [], trendError = null, onClose }) {
  const titleId = useId();
  // Keep the last shown parameter around so the panel doesn't flash empty during
  // the slide-out: when the dashboard clears the selection on close, `stat` goes
  // null, but we render the cached view until the panel is off-screen. Adjusting
  // state during render is React's endorsed alternative to an effect for
  // "remember the last props" — the same pattern Layout uses for lastPath. While
  // a parameter is selected we mirror the live view into `cached`; the guard
  // makes it a no-op once they match, so it settles in one extra render and never
  // loops. On open `view` uses the live props directly, so the cache only matters
  // once closing has begun and `stat` is already null.
  const [cached, setCached] = useState(null);
  if (
    stat &&
    (cached?.stat !== stat ||
      cached?.trend !== trend ||
      cached?.trendError !== trendError)
  ) {
    setCached({ stat, trend, trendError });
  }
  const view = stat ? { stat, trend, trendError } : cached;

  return (
    <Drawer open={open} titleId={titleId} onClose={onClose}>
      {view && (
        <DrawerBody
          stat={view.stat}
          trend={view.trend}
          trendError={view.trendError}
          titleId={titleId}
          onClose={onClose}
        />
      )}
    </Drawer>
  );
}

export default ParameterDrawer;
