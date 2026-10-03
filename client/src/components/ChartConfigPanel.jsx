import {
  CHART_KINDS,
  COMPARISON_SHAPES,
  HEATMAP_AXES,
  IMAGE_FORMATS,
  MAX_CHARTS,
} from '../lib/exportConfig.js';

const KIND_LABELS = {
  trend: 'Trend over periods',
  distribution: 'Score distribution',
  comparison: 'Parameter comparison',
  heatmap: 'Heatmap matrix',
};
const SHAPE_LABELS = { bar: 'Grouped bars', radar: 'Radar' };
const AXIS_LABELS = { period: 'Periods across, one parameter', parameter: 'Parameters across, one period' };

function newChart(kind = 'trend') {
  return {
    kind,
    parameterIds: [],
    periodNumber: null,
    comparisonShape: 'bar',
    heatmapAxis: 'period',
    imageFormat: 'png',
  };
}

// A compact multi-select for parameters, used by the trend/comparison charts.
function ParameterChecklist({ chosen, parameters, onChange }) {
  const selected = new Set(chosen);
  function toggle(id, on) {
    const ids = on ? [...selected, id] : chosen.filter((item) => item !== id);
    onChange([...new Set(ids)]);
  }
  return (
    <div className="columns-list scroll-list small">
      {parameters.map((parameter) => (
        <label key={parameter.id} className="inline">
          <input
            type="checkbox"
            checked={selected.has(parameter.id)}
            onChange={(event) => toggle(parameter.id, event.target.checked)}
          />
          {parameter.name}
        </label>
      ))}
      {parameters.length === 0 && <p className="hint">No parameters available.</p>}
    </div>
  );
}

function ChartEditor({ chart, parameters, periodNumbers, current, onChange, onRemove }) {
  function patch(changes) {
    onChange({ ...chart, ...changes });
  }
  const periodOptions = periodNumbers.length ? periodNumbers : [current];

  return (
    <div className="section-card chart-editor">
      <div className="toolbar">
        <label className="inline">
          Chart
          <select value={chart.kind} onChange={(event) => patch({ kind: event.target.value })}>
            {CHART_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="inline">
          Image
          <select
            value={chart.imageFormat}
            onChange={(event) => patch({ imageFormat: event.target.value })}
          >
            {IMAGE_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="quiet" onClick={onRemove}>
          Remove
        </button>
      </div>

      {(chart.kind === 'trend' || chart.kind === 'comparison') && (
        <>
          <p className="hint">Parameters to plot</p>
          <ParameterChecklist
            chosen={chart.parameterIds}
            parameters={parameters}
            onChange={(parameterIds) => patch({ parameterIds })}
          />
        </>
      )}

      {chart.kind === 'comparison' && (
        <label className="inline">
          Shape
          <select
            value={chart.comparisonShape}
            onChange={(event) => patch({ comparisonShape: event.target.value })}
          >
            {COMPARISON_SHAPES.map((shape) => (
              <option key={shape} value={shape}>
                {SHAPE_LABELS[shape]}
              </option>
            ))}
          </select>
        </label>
      )}

      {chart.kind === 'distribution' && (
        <>
          <label className="inline">
            Parameter
            <select
              value={chart.parameterIds[0] ?? ''}
              onChange={(event) => patch({ parameterIds: event.target.value ? [event.target.value] : [] })}
            >
              <option value="">Choose a parameter…</option>
              {parameters.map((parameter) => (
                <option key={parameter.id} value={parameter.id}>
                  {parameter.name}
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            Period
            <select
              value={chart.periodNumber ?? current}
              onChange={(event) => patch({ periodNumber: Number(event.target.value) })}
            >
              {periodOptions.map((number) => (
                <option key={number} value={number}>
                  Period {number}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {chart.kind === 'heatmap' && (
        <>
          <label className="inline">
            Layout
            <select
              value={chart.heatmapAxis}
              onChange={(event) => patch({ heatmapAxis: event.target.value })}
            >
              {HEATMAP_AXES.map((axis) => (
                <option key={axis} value={axis}>
                  {AXIS_LABELS[axis]}
                </option>
              ))}
            </select>
          </label>
          {chart.heatmapAxis === 'period' && (
            <label className="inline">
              Parameter
              <select
                value={chart.parameterIds[0] ?? ''}
                onChange={(event) => patch({ parameterIds: event.target.value ? [event.target.value] : [] })}
              >
                <option value="">First available</option>
                {parameters.map((parameter) => (
                  <option key={parameter.id} value={parameter.id}>
                    {parameter.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {chart.heatmapAxis === 'parameter' && (
            <label className="inline">
              Period
              <select
                value={chart.periodNumber ?? current}
                onChange={(event) => patch({ periodNumber: Number(event.target.value) })}
              >
                {periodOptions.map((number) => (
                  <option key={number} value={number}>
                    Period {number}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
    </div>
  );
}

// Add, configure, and remove any number of charts (up to MAX_CHARTS). `value`
// is config.charts; `onChange` receives the next charts array.
function ChartConfigPanel({ value, parameters, periodNumbers, current, onChange }) {
  function add() {
    onChange([...value, newChart()]);
  }
  function update(index, chart) {
    onChange(value.map((item, i) => (i === index ? chart : item)));
  }
  function remove(index) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <fieldset className="export-fieldset">
      <legend>Charts</legend>
      {value.length === 0 && (
        <p className="hint">No charts. Add one to include a chart image in the export.</p>
      )}
      {value.map((chart, index) => (
        <ChartEditor
          key={index}
          chart={chart}
          parameters={parameters}
          periodNumbers={periodNumbers}
          current={current}
          onChange={(next) => update(index, next)}
          onRemove={() => remove(index)}
        />
      ))}
      <button
        type="button"
        className="primary"
        onClick={add}
        disabled={value.length >= MAX_CHARTS}
      >
        Add chart
      </button>
      {value.length >= MAX_CHARTS && (
        <span className="hint"> Maximum of {MAX_CHARTS} charts.</span>
      )}
    </fieldset>
  );
}

export default ChartConfigPanel;
