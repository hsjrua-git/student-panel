import { useTranslation } from 'react-i18next';
import { formatIsoDate } from '../lib/format.js';

function PeriodPicker({ periods, value, onChange }) {
  const { t } = useTranslation(['reports', 'common']);
  const list = periods.periods;
  const selected = list.find((period) => period.number === value);

  return (
    <div className="period-picker">
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 1}>
        {t('periodPicker.previous')}
      </button>
      <select
        aria-label={t('shared.period')}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {[...list].reverse().map((period) => (
          <option key={period.number} value={period.number}>
            {t('shared.periodNumber', { number: period.number })}
            {period.number === periods.current ? t('shared.currentSuffix') : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= periods.current}
      >
        {t('periodPicker.next')}
      </button>
      {selected && (
        <span className="hint">
          {t('periodPicker.range', {
            start: formatIsoDate(selected.startDate),
            end: formatIsoDate(selected.endDate),
          })}
        </span>
      )}
    </div>
  );
}

export default PeriodPicker;
