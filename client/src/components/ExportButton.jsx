import { useState } from 'react';
import { toCsv } from '../lib/csv.js';
import { downloadTextFile } from '../lib/download.js';
import { usePreferences } from '../preferences/PreferencesContext.jsx';

function ExportButton({ label, filename, buildRows, disabled = false }) {
  const { preferences } = usePreferences();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const rows = await buildRows();
      downloadTextFile(
        filename,
        toCsv(rows, { delimiter: preferences.csvDelimiter })
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={handleClick} disabled={disabled || busy}>
        {busy ? 'Preparing...' : label}
      </button>
      {error && <span className="error"> {error}</span>}
    </>
  );
}

export default ExportButton;