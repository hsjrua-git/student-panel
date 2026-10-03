import { includesTabular } from '../lib/exportConfig.js';
import { cubeLongRows, cubeWideRows } from '../lib/exports.js';
import TrendChart from './TrendChart.jsx';
import DistributionChart from './DistributionChart.jsx';
import ComparisonChart from './ComparisonChart.jsx';
import HeatmapMatrix from './HeatmapMatrix.jsx';

const PREVIEW_ROWS = 8;

const CHART_TITLES = {
  trend: 'Trend over periods',
  distribution: 'Score distribution',
  comparison: 'Parameter comparison',
  heatmap: 'Heatmap matrix',
};

// One chart, chosen by kind. Rendered into the visible preview (not hidden) so
// the Export run can read its final, measured <svg> for image export.
function ChartView({ cube, chart }) {
  switch (chart.kind) {
    case 'trend':
      return <TrendChart cube={cube} parameterIds={chart.parameterIds} />;
    case 'distribution':
      return (
        <DistributionChart
          cube={cube}
          parameterId={chart.parameterIds[0] ?? null}
          periodNumber={chart.periodNumber}
        />
      );
    case 'comparison':
      return (
        <ComparisonChart
          cube={cube}
          parameterIds={chart.parameterIds}
          shape={chart.comparisonShape}
        />
      );
    case 'heatmap':
      return (
        <HeatmapMatrix
          cube={cube}
          axis={chart.heatmapAxis}
          parameterId={chart.parameterIds[0] ?? null}
          periodNumber={chart.periodNumber}
        />
      );
    default:
      return null;
  }
}

// A bounded table taken from a 2-D row array (first row is the header).
function PreviewTable({ rows }) {
  if (rows.length <= 1) {
    return <p className="hint">No rows for the current scope.</p>;
  }
  const [header, ...body] = rows;
  const shown = body.slice(0, PREVIEW_ROWS);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {header.map((cell, index) => (
              <th key={index}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell === null ? '—' : String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {body.length > shown.length && (
        <p className="hint">+ {body.length - shown.length} more rows in the file.</p>
      )}
    </div>
  );
}

// The right-hand column: a summary of the resolved scope, a bounded table
// preview of the scores, and the live chart(s). `registerChart(index, node)`
// hands each chart's container back to the page so the run can grab its <svg>.
function ExportPreview({ config, cube, registerChart }) {
  const dataRows =
    config.layout === 'long' ? cubeLongRows(cube) : cubeWideRows(cube);

  return (
    <div className="export-preview">
      <p className="summary-line">
        {cube.students.length} student{cube.students.length === 1 ? '' : 's'} ·{' '}
        {cube.parameters.length} parameter{cube.parameters.length === 1 ? '' : 's'} ·{' '}
        {cube.periods.length} period{cube.periods.length === 1 ? '' : 's'}
      </p>

      {includesTabular(config) && config.include.data && (
        <section className="section-card">
          <h3 className="group-title">Scores preview</h3>
          <PreviewTable rows={dataRows} />
        </section>
      )}

      {config.charts.map((chart, index) => (
        <section className="section-card" key={index}>
          <h3 className="group-title">
            {CHART_TITLES[chart.kind]} · {chart.imageFormat.toUpperCase()}
          </h3>
          <div
            className="chart-capture"
            ref={(node) => registerChart(index, node)}
          >
            <ChartView cube={cube} chart={chart} />
          </div>
        </section>
      ))}

      {config.charts.length === 0 && !includesTabular(config) && (
        <p className="hint">Nothing selected to export yet.</p>
      )}
    </div>
  );
}

export default ExportPreview;
