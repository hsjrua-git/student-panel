// The "what to include" checkboxes. Everything is multi-select: an export can
// carry the scores cube (data), the period-over-period deltas, the parameter
// tracking log, and the full edit audit trail together. `value` is
// config.include; `onChange` receives the next include object.
const ITEMS = [
  { key: 'data', label: 'Scores (data)', hint: 'The measured values themselves.' },
  {
    key: 'delta',
    label: 'Changes vs previous period',
    hint: 'Each score alongside how much it moved since the period before.',
  },
  {
    key: 'trackingLog',
    label: 'Parameter tracking log',
    hint: 'When each parameter started or stopped being measured.',
  },
  {
    key: 'auditTrail',
    label: 'Edit audit trail',
    hint: 'The recorded history of who changed what.',
  },
];

function IncludePicker({ value, onChange }) {
  function toggle(key, on) {
    onChange({ ...value, [key]: on });
  }

  return (
    <fieldset className="export-fieldset">
      <legend>Include</legend>
      <div className="include-list">
        {ITEMS.map((item) => (
          <label key={item.key} className="inline include-item">
            <input
              type="checkbox"
              checked={value[item.key]}
              onChange={(event) => toggle(item.key, event.target.checked)}
            />
            <span>
              {item.label}
              <span className="hint block">{item.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default IncludePicker;
