import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import { Link } from 'react-router';
import { importStudents } from '../api/students.js';
import { useAuth } from '../auth/AuthContext.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { createdStudentsCsvRows } from '../lib/exports.js';
import { formatStudentCode, toIsoDate } from '../lib/format.js';
import {
  buildNames,
  guessColumns,
  looksLikeHeader,
  prepareRows,
} from '../lib/importNames.js';

const MAX_ROWS = 500;
const MAX_FILE_BYTES = 1_000_000;

function columnLabel(index, headerCells) {
  const header = headerCells ? String(headerCells[index] ?? '').trim() : '';
  return header ? `Column ${index + 1}: ${header}` : `Column ${index + 1}`;
}

function describeRow(item) {
  if (item.status === 'invalid') return `Skipped: ${item.message}`;
  if (item.status === 'ok') return 'Will be added';
  if (item.willImport) return `Will be added (${item.message})`;
  const code = item.existingCode
    ? ` Existing code: ${formatStudentCode(item.existingCode)}.`
    : '';
  return `Skipped: ${item.message}${code}`;
}

function ColumnSelect({ label, value, onChange, columnCount, headerCells }) {
  return (
    <label className="inline">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {Array.from({ length: columnCount }, (_, index) => (
          <option key={index} value={index}>
            {columnLabel(index, headerCells)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ImportStudentsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [parseError, setParseError] = useState(null);
  const [hasHeader, setHasHeader] = useState(false);
  const [mode, setMode] = useState('single');
  const [firstColumn, setFirstColumn] = useState(0);
  const [secondColumn, setSecondColumn] = useState(1);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [stage, setStage] = useState('choose');
  const [done, setDone] = useState(null);

  const check = useMutation({ mutationFn: importStudents });
  const run = useMutation({ mutationFn: importStudents });

  const columnCount = rows.reduce(
    (max, item) => Math.max(max, item.cells.length),
    0
  );
  const headerCells = hasHeader ? rows[0]?.cells : null;
  const names = useMemo(
    () =>
      buildNames({
        rows,
        hasHeader,
        mode,
        firstColumn,
        secondColumn: mode === 'two' ? secondColumn : null,
      }),
    [rows, hasHeader, mode, firstColumn, secondColumn]
  );

  function startOver() {
    setFileName('');
    setRows([]);
    setParseError(null);
    setHasHeader(false);
    setMode('single');
    setFirstColumn(0);
    setSecondColumn(1);
    setAllowDuplicates(false);
    setStage('choose');
    setDone(null);
    check.reset();
    run.reset();
  }

  async function handleFile(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    startOver();
    setFileName(file.name);
    if (file.size > MAX_FILE_BYTES) {
      setParseError('This file is larger than 1 MB. Split it into smaller files.');
      input.value = '';
      return;
    }

    const text = (await file.text()).replace(/^\uFEFF/, '');
    const prepared = prepareRows(Papa.parse(text, { skipEmptyLines: false }).data);
    input.value = '';
    if (prepared.length === 0) {
      setParseError('The file has no rows.');
      return;
    }

    const header = looksLikeHeader(prepared[0].cells);
    const guess = header
      ? guessColumns(prepared[0].cells)
      : { mode: 'single', firstColumn: 0, secondColumn: null };

    setRows(prepared);
    setHasHeader(header);
    setMode(guess.mode);
    setFirstColumn(guess.firstColumn);
    setSecondColumn(guess.secondColumn ?? 1);
  }

  function handleCheck() {
    check.mutate(
      { rows: names, allowDuplicateNames: allowDuplicates, dryRun: true },
      { onSuccess: () => setStage('preview') }
    );
  }

  function handleAllowChange(checked) {
    setAllowDuplicates(checked);
    check.mutate({ rows: names, allowDuplicateNames: checked, dryRun: true });
  }

  function handleImport() {
    run.mutate(
      { rows: names, allowDuplicateNames: allowDuplicates, dryRun: false },
      {
        onSuccess: (data) => {
          setDone(data);
          setStage('done');
          queryClient.invalidateQueries({ queryKey: ['students'] });
        },
      }
    );
  }

  if (!can('data.import')) {
    return (
      <main>
        <h1>Import students</h1>
        <p>You do not have permission to import students.</p>
      </main>
    );
  }

  const tooMany = names.length > MAX_ROWS;
  const result = check.data;

  return (
    <main className="wide">
      <p>
        <Link to="/students">← Back to students</Link>
      </p>
      <h1>Import students</h1>

      {stage === 'choose' && (
        <>
          <p className="hint">
            Choose a CSV file with one student per row. If your list is in
            Excel or LibreOffice, use "Save as" and pick CSV (UTF-8). Students
            get a random code when they are added.
          </p>
          <input
            type="file"
            accept=".csv,.txt,text/csv"
            aria-label="Choose a CSV file of student names to import"
            onChange={handleFile}
          />
          {parseError && (
            <p className="error" role="alert">
              {parseError}
            </p>
          )}

          {rows.length > 0 && (
            <>
              <h2>{fileName}</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      {Array.from({ length: columnCount }, (_, index) => (
                        <th key={index}>Column {index + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((item) => (
                      <tr key={item.row}>
                        <td>{item.row}</td>
                        {Array.from({ length: columnCount }, (_, index) => (
                          <td key={index}>{item.cells[index] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 5 && (
                <p className="hint">Showing the first 5 of {rows.length} rows.</p>
              )}

              <div className="pref-group">
                <label className="inline">
                  <input
                    type="checkbox"
                    checked={hasHeader}
                    onChange={(event) => setHasHeader(event.target.checked)}
                  />
                  The first row is a header, not a student
                </label>
                <label className="inline">
                  Names are in
                  <select value={mode} onChange={(event) => setMode(event.target.value)}>
                    <option value="single">One column (full name)</option>
                    <option value="two">Two columns (first name and last name)</option>
                  </select>
                </label>
                <ColumnSelect
                  label={mode === 'two' ? 'First name' : 'Full name'}
                  value={firstColumn}
                  onChange={setFirstColumn}
                  columnCount={columnCount}
                  headerCells={headerCells}
                />
                {mode === 'two' && (
                  <ColumnSelect
                    label="Last name"
                    value={secondColumn}
                    onChange={setSecondColumn}
                    columnCount={columnCount}
                    headerCells={headerCells}
                  />
                )}
              </div>

              {tooMany && (
                <p className="error">
                  This file has {names.length} students. Import at most{' '}
                  {MAX_ROWS} at a time.
                </p>
              )}
              <button
                type="button"
                onClick={handleCheck}
                disabled={names.length === 0 || tooMany || check.isPending}
              >
                {check.isPending ? 'Checking...' : 'Check file'}
              </button>
              {check.isError && (
                <p className="error" role="alert">
                  {check.error.message}
                </p>
              )}
            </>
          )}
        </>
      )}

      {stage === 'preview' && result && (
        <>
          <h2>{fileName}</h2>
          <p className="summary-line">
            {result.counts.total} rows checked:{' '}
            <strong>{result.counts.willImport} will be added</strong>,{' '}
            {result.counts.skipped} skipped ({result.counts.invalid} invalid,{' '}
            {result.counts.duplicates} with a repeated name).
          </p>
          <label className="inline">
            <input
              type="checkbox"
              checked={allowDuplicates}
              onChange={(event) => handleAllowChange(event.target.checked)}
              disabled={check.isPending}
            />
            Also add rows whose name already appears (two students can share a
            name)
          </label>

          <div className="table-wrap">
            <table className={check.isPending ? 'stale' : undefined}>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Full name</th>
                  <th>What will happen</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((item) => (
                  <tr
                    key={item.row}
                    className={item.willImport ? undefined : 'bad'}
                  >
                    <td>{item.row}</td>
                    <td>{item.fullName}</td>
                    <td>{describeRow(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row">
            <button
              type="button"
              onClick={handleImport}
              disabled={
                result.counts.willImport === 0 || run.isPending || check.isPending
              }
            >
              {run.isPending
                ? 'Importing...'
                : `Import ${result.counts.willImport} student${
                    result.counts.willImport === 1 ? '' : 's'
                  }`}
            </button>
            <button type="button" onClick={startOver} disabled={run.isPending}>
              Choose another file
            </button>
          </div>
          {check.isError && (
            <p className="error" role="alert">
              {check.error.message}
            </p>
          )}
          {run.isError && (
            <p className="error" role="alert">
              {run.error.message}
            </p>
          )}
        </>
      )}

      {stage === 'done' && done && (
        <>
          <p className="success" role="status">
            Added {done.created.length} student
            {done.created.length === 1 ? '' : 's'}
            {done.counts.skipped > 0 &&
              `, skipped ${done.counts.skipped} row${
                done.counts.skipped === 1 ? '' : 's'
              }`}
            .
          </p>
          <p className="hint">
            Each student got a random code. Download this list to keep the
            codes with the names. You can also find them later on the Students
            page.
          </p>
          <div className="row">
            <ExportButton
              label="Download the list with codes (CSV)"
              filename={`imported-students-${toIsoDate(new Date())}.csv`}
              buildRows={() => createdStudentsCsvRows(done.created)}
            />
            <Link to="/students">Go to students</Link>
            <button type="button" onClick={startOver}>
              Import another file
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Code</th>
                  <th>Full name</th>
                </tr>
              </thead>
              <tbody>
                {done.created.map((student) => (
                  <tr key={student.id}>
                    <td>{student.row}</td>
                    <td className="code">
                      {formatStudentCode(student.studentCode)}
                    </td>
                    <td>{student.fullName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}

export default ImportStudentsPage;