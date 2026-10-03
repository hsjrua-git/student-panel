import { useMemo } from 'react';
import { buildHeatmap } from '../lib/heatmap.js';

// A student × axis matrix, each cell shaded by where the score sits in the
// parameter's range. Hand-drawn SVG (not recharts) so it exports cleanly: the
// fills use CSS color-mix through an inline `style`, which resolves on screen
// AND is inlined as a concrete colour when `chartImage.js` serialises the SVG.
const CELL_W = 46;
const CELL_H = 26;
const LEFT = 150;
const TOP = 30;
const GAP = 2;

function truncate(text, max = 20) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function HeatmapMatrix({ cube, axis = 'period', parameterId = null, periodNumber = null }) {
  const model = useMemo(
    () => buildHeatmap(cube, { axis, parameterId, periodNumber }),
    [cube, axis, parameterId, periodNumber]
  );

  const { rows, columns, cells } = model;
  if (rows.length === 0 || columns.length === 0) {
    return <p className="hint">Nothing to chart for this scope.</p>;
  }

  const width = LEFT + columns.length * CELL_W;
  const height = TOP + rows.length * CELL_H;
  const caption =
    axis === 'parameter'
      ? `Period ${model.periodNumber ?? '—'} · columns are parameters`
      : `${model.parameterName ?? '—'} · columns are periods`;

  return (
    <div className="chart-box">
      <p className="hint">{caption}</p>
      <div className="heatmap-wrap">
        <svg
          className="heatmap-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Heatmap — ${caption}`}
        >
          {columns.map((column, columnIndex) => (
            <text
              key={`h-${column.key}`}
              x={LEFT + columnIndex * CELL_W + CELL_W / 2}
              y={TOP - 10}
              textAnchor="middle"
              style={{ fill: 'var(--ink-soft)', fontSize: '11px', fontWeight: 600 }}
            >
              {truncate(String(column.label), 8)}
            </text>
          ))}
          {rows.map((row, rowIndex) => (
            <text
              key={`r-${row.id}`}
              x={LEFT - 8}
              y={TOP + rowIndex * CELL_H + CELL_H / 2}
              textAnchor="end"
              dominantBaseline="middle"
              style={{ fill: 'var(--ink)', fontSize: '11px' }}
            >
              {truncate(row.label)}
            </text>
          ))}
          {rows.map((row, rowIndex) =>
            columns.map((column, columnIndex) => {
              const cell = cells[rowIndex][columnIndex];
              const filled = cell.value !== null && cell.percent !== null;
              const fill = filled
                ? `color-mix(in srgb, var(--brand) ${cell.percent}%, var(--surface-2))`
                : 'var(--surface-2)';
              const textFill = filled && cell.percent > 55 ? 'var(--surface)' : 'var(--ink)';
              const x = LEFT + columnIndex * CELL_W;
              const y = TOP + rowIndex * CELL_H;
              return (
                <g key={`${row.id}-${column.key}`}>
                  <rect
                    x={x + GAP / 2}
                    y={y + GAP / 2}
                    width={CELL_W - GAP}
                    height={CELL_H - GAP}
                    rx="3"
                    style={{ fill, stroke: 'var(--surface)', strokeWidth: 1 }}
                  >
                    <title>
                      {row.label} — {column.label}:{' '}
                      {cell.value === null ? 'no score' : cell.value}
                    </title>
                  </rect>
                  {cell.value !== null && (
                    <text
                      x={x + CELL_W / 2}
                      y={y + CELL_H / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ fill: textFill, fontSize: '10px' }}
                    >
                      {cell.value}
                    </text>
                  )}
                </g>
              );
            })
          )}
        </svg>
      </div>
    </div>
  );
}

export default HeatmapMatrix;
