import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import { Link } from 'react-router';
import { listPeriodParameters, saveEvaluations } from '../api/evaluations.js';
import { listParameters } from '../api/parameters.js';
import { fetchAllStudents } from '../api/students.js';
import { useAuth } from '../auth/AuthContext.jsx';
import ExportButton from '../components/ExportButton.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import { scoreTemplateCsvRows } from '../lib/exports.js';
import { formatIsoDate, formatStudentCode } from '../lib/format.js';
import { prepareRows } from '../lib/importNames.js';
import {
  MAX_SCORE_CELLS,
  buildImport,
  guessLayout,
  looksLikeScoreHeader,
  nameKey,
  normalizeCode,
  planImport,
  reasonValid,
} from '../lib/scoreImport.js';
import { usePeriods } from '../lib/usePeriods.js';

const EMPTY = [];
const MAX_FILE_BYTES = 2_000_000;

function columnLabel(index, headerCells) {
  const header = headerCells ? String(headerCells[index] ?? '').trim() : '';
  return header ? `Column ${index + 1}: ${header}` : `Column ${index + 1}`;
}

function CellView({ cell, info, canOverride }) {
  if (cell.blank) {
    return (
      <div className="muted" title="Empty cells are ignored">
        —
      </div>
    );
  }
  if (cell.problem) {
    return (
      <div className="error">
        {cell.text}
        <div className="small">{cell.problem}</div>
      </div>
    );
  }
  if (!info) return <div className="muted">{cell.text}</div>;

  if (info.status === 'problem') {
    return (
      <div className="error">
        {cell.text}
        <div className="small">{info.message}</div>
      </div>
    );
  }
  if (info.status === 'unchanged') {
    return <div className="muted">{info.to} (same)</div>;
  }
  if (info.status === 'new') {
    return (
      <div>
        <strong>{info.to}</strong> <span className="chg">new</span>
      </div>
    );
  }
  if (info.status === 'change') {
    return (
      <div>
        {info.from} → <strong>{info.to}</strong>
      </div>
    );
  }
  // Blind-entry role: the server redacts the existing value, so we can only
  // show what is about to be written, not a before → after diff.
  if (info.status === 'save') {
    return (
      <div>
        <strong>{info.to}</strong> <span className="chg">save</span>
      </div>
    );
  }
  return (
    <div className={canOverride ? undefined : 'error'}>
      🔒 {info.from ?? '—'} → <strong>{info.to}</strong>
      <div className="small">
        {canOverride
          ? 'Locked. Needs a reason.'
          : 'Locked. Only an administrator can change it.'}
      </div>
    </div>
  );
}

function ColumnOptions({ columnCount, headerCells }) {
  return Array.from({ length: columnCount }, (_, index) => (
    <option key={index} value={index}>
      {columnLabel(index, headerCells)}
    </option>
  ));
}

function ImportScoresPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const periodsQuery = usePeriods();
  const periods = periodsQuery.data;

  const [chosenPeriod, setChosenPeriod] = useState(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [parseError, setParseError] = useState(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [codeChoice, setCodeChoice] = useState(null);
  const [nameChoice, setNameChoice] = useState(undefined);
  const [mappingChoice, setMappingChoice] = useState({});
  const [skipProblems, setSkipProblems] = useState(false);
  const [reason, setReason] = useState('');
  const [stage, setStage] = useState('choose');
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);

  const periodNumber = chosenPeriod ?? periods?.current ?? null;

  const paramsQuery = useQuery({
    queryKey: ['period-parameters', periodNumber],
    queryFn: () => listPeriodParameters(periodNumber),
    enabled: periodNumber !== null,
  });
  const allParamsQuery = useQuery({
    queryKey: ['parameters'],
    queryFn: listParameters,
  });
  const studentsQuery = useQuery({
    queryKey: ['students-all'],
    queryFn: fetchAllStudents,
    enabled: can('scores.enter'),
  });

  const check = useMutation({ mutationFn: saveEvaluations });
  const run = useMutation({ mutationFn: saveEvaluations });

  const periodParameters = paramsQuery.data ?? EMPTY;

  const guess = useMemo(
    () =>
      hasHeader && rows.length > 0
        ? guessLayout(rows[0].cells, periodParameters)
        : { codeColumn: null, nameColumn: null, mapping: {} },
    [hasHeader, rows, periodParameters]
  );
  const codeColumn = codeChoice ?? guess.codeColumn ?? 0;
  const nameColumn = nameChoice === undefined ? guess.nameColumn : nameChoice;
  const mapping = useMemo(
    () => ({ ...guess.mapping, ...mappingChoice }),
    [guess, mappingChoice]
  );

  const studentsByCode = useMemo(
    () =>
      new Map(
        (studentsQuery.data ?? EMPTY).map((student) => [
          normalizeCode(student.studentCode),
          student,
        ])
      ),
    [studentsQuery.data]
  );

  const built = useMemo(() => {
    if (rows.length === 0 || !studentsQuery.data) return null;
    return buildImport({
      rows,
      hasHeader,
      codeColumn,
      nameColumn,
      mapping,
      parameters: periodParameters,
      studentsByCode,
    });
  }, [
    rows,
    hasHeader,
    codeColumn,
    nameColumn,
    mapping,
    periodParameters,
    studentsByCode,
    studentsQuery.data,
  ]);

  const serverByIndex = useMemo(() => {
    const map = new Map();
    if (preview) {
      for (const cell of preview.server.cells) map.set(cell.index, cell);
      for (const problem of preview.server.problems) {
        map.set(problem.index, { status: 'problem', message: problem.message });
      }
    }
    return map;
  }, [preview]);

  function resetAll() {
    setFileName('');
    setRows([]);
    setParseError(null);
    setHasHeader(true);
    setCodeChoice(null);
    setNameChoice(undefined);
    setMappingChoice({});
    setSkipProblems(false);
    setReason('');
    setStage('choose');
    setPreview(null);
    setDone(null);
    check.reset();
    run.reset();
  }

  async function handleFile(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    resetAll();
    setFileName(file.name);
    if (file.size > MAX_FILE_BYTES) {
      setParseError('This file is larger than 2 MB. Split it into smaller files.');
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
    setRows(prepared);
    setHasHeader(looksLikeScoreHeader(prepared[0].cells, periodParameters));
  }

  function handleCheck() {
    check.mutate(
      { periodNumber, entries: built.entries, dryRun: true },
      {
        onSuccess: (server) => {
          setPreview({ built, server });
          setStage('preview');
        },
      }
    );
  }

  function backToSettings() {
    setStage('choose');
    check.reset();
    run.reset();
  }

  const canOverride = can('scores.override');
  const plan = preview
    ? planImport({ built: preview.built, server: preview.server, canOverride })
    : null;
  const needsReason = plan !== null && plan.lockedOverride > 0;
  const canRun =
    plan !== null &&
    plan.send.length > 0 &&
    (plan.problemCount === 0 || skipProblems) &&
    (!needsReason || reasonValid(reason)) &&
    !run.isPending;

  function handleImport() {
    run.mutate(
      {
        periodNumber,
        entries: plan.send,
        source: 'import',
        overrideReason: needsReason
          ? reason.trim().replace(/\s+/g, ' ')
          : undefined,
      },
      {
        onSuccess: (data) => {
          setDone({
            changed: data.changed,
            unchanged: plan.unchanged,
            skipped: plan.problemCount,
          });
          setStage('done');
          queryClient.invalidateQueries({ queryKey: ['evaluations'] });
          queryClient.invalidateQueries({ queryKey: ['results'] });
          queryClient.invalidateQueries({ queryKey: ['trends'] });
        },
      }
    );
  }

  if (!can('scores.enter')) {
    return (
      <main>
        <h1>Import scores</h1>
        <p>You do not have permission to import scores.</p>
      </main>
    );
  }
  if (periodsQuery.isPending) {
    return (
      <main>
        <p>Loading...</p>
      </main>
    );
  }
  if (periodsQuery.isError) {
    return (
      <main>
        <p className="error">{periodsQuery.error.message}</p>
      </main>
    );
  }
  if (!periods.anchorDate) {
    return (
      <main>
        <h1>Import scores</h1>
        <p>An administrator needs to set the period start date first.</p>
      </main>
    );
  }
  if (periods.current === null) {
    return (
      <main>
        <h1>Import scores</h1>
        <p>Period 1 has not started yet.</p>
      </main>
    );
  }

  const period = periods.periods.find((item) => item.number === periodNumber);
  const columnCount = rows.reduce(
    (max, item) => Math.max(max, item.cells.length),
    0
  );
  const headerCells = hasHeader && rows.length > 0 ? rows[0].cells : null;

  const usedColumns = new Set([
    codeColumn,
    ...(nameColumn === null ? [] : [nameColumn]),
    ...Object.values(mapping).filter(Number.isInteger),
  ]);
  const ignoredHeaders = headerCells
    ? headerCells
        .map((cell, index) => ({ index, text: String(cell ?? '').trim() }))
        .filter(({ index, text }) => text !== '' && !usedColumns.has(index))
        .map(({ text }) => text)
    : [];
  const notUsedHere = ignoredHeaders.filter((text) =>
    (allParamsQuery.data ?? EMPTY).some(
      (parameter) => nameKey(parameter.name) === nameKey(text)
    )
  );

  const tooMany = built !== null && built.entries.length > MAX_SCORE_CELLS;
  const server = preview?.server;

  return (
    <main className="wide">
      <p>
        <Link to="/evaluate">← Back to Evaluate</Link>
      </p>
      <h1>Import scores</h1>

      {stage === 'choose' && (
        <>
          <p className="hint">
            Choose the period, then a CSV file with one row per student. Each
            student is found by their code, and each score column by its
            parameter name. Empty cells are ignored (they never clear an
            existing score).
          </p>
          <PeriodPicker
            periods={periods}
            value={periodNumber}
            onChange={setChosenPeriod}
          />

          <p>
            <ExportButton
              label={`Download a template for Period ${periodNumber}`}
              filename={`score-template-period-${periodNumber}.csv`}
              disabled={periodParameters.length === 0}
              buildRows={async () =>
                scoreTemplateCsvRows({
                  students: await fetchAllStudents(),
                  parameters: periodParameters,
                })
              }
            />
          </p>
          {paramsQuery.isSuccess && periodParameters.length === 0 && (
            <p className="error">
              No parameters are used in Period {periodNumber}, so there is
              nothing to import.
            </p>
          )}

          <input
            type="file"
            accept=".csv,.txt,text/csv"
            aria-label="Choose a CSV file of scores to import"
            onChange={handleFile}
          />
          {parseError && (
            <p className="error" role="alert">
              {parseError}
            </p>
          )}
          {rows.length > 0 && studentsQuery.isPending && <p>Loading students...</p>}
          {studentsQuery.isError && (
            <p className="error" role="alert">
              {studentsQuery.error.message}
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
                  Student code is in
                  <select
                    value={codeColumn}
                    onChange={(event) => setCodeChoice(Number(event.target.value))}
                  >
                    <ColumnOptions columnCount={columnCount} headerCells={headerCells} />
                  </select>
                </label>
                <label className="inline">
                  Name (only to double-check the code)
                  <select
                    value={nameColumn ?? ''}
                    onChange={(event) =>
                      setNameChoice(
                        event.target.value === '' ? null : Number(event.target.value)
                      )
                    }
                  >
                    <option value="">No name column</option>
                    <ColumnOptions columnCount={columnCount} headerCells={headerCells} />
                  </select>
                </label>
              </div>

              <h3>Which column holds each score?</h3>
              {!hasHeader && (
                <p className="hint">
                  Without a header row, choose the columns yourself.
                </p>
              )}
              <div className="pref-group">
                {periodParameters.map((parameter) => (
                  <label key={parameter.id} className="inline">
                    {parameter.name}
                    <select
                      value={mapping[parameter.id] ?? ''}
                      onChange={(event) =>
                        setMappingChoice((existing) => ({
                          ...existing,
                          [parameter.id]:
                            event.target.value === ''
                              ? null
                              : Number(event.target.value),
                        }))
                      }
                    >
                      <option value="">Not in the file</option>
                      <ColumnOptions
                        columnCount={columnCount}
                        headerCells={headerCells}
                      />
                    </select>
                  </label>
                ))}
              </div>
              {ignoredHeaders.length > 0 && (
                <p className="hint">
                  Ignored columns: {ignoredHeaders.join(', ')}.
                </p>
              )}
              {notUsedHere.length > 0 && (
                <p className="hint">
                  {notUsedHere.join(', ')}{' '}
                  {notUsedHere.length === 1 ? 'is a parameter' : 'are parameters'}{' '}
                  that {notUsedHere.length === 1 ? 'is' : 'are'} not used in
                  Period {periodNumber}, so{' '}
                  {notUsedHere.length === 1 ? 'it is' : 'they are'} ignored.
                </p>
              )}

              {built && (
                <p className="summary-line">
                  {built.rows.length} rows read ·{' '}
                  {built.rows.filter((item) => !item.rowProblem).length} matched
                  to a student · {built.entries.length} scores to check
                  {built.localProblemCount > 0 && (
                    <> · {built.localProblemCount} problems (shown after checking)</>
                  )}
                </p>
              )}
              {tooMany && (
                <p className="error">
                  This file has {built.entries.length} scores. Import at most{' '}
                  {MAX_SCORE_CELLS} at a time.
                </p>
              )}
              {built && built.entries.length === 0 && (
                <p className="error">
                  No scores were found. Check the columns above.
                </p>
              )}
              <button
                type="button"
                onClick={handleCheck}
                disabled={
                  !built ||
                  built.entries.length === 0 ||
                  tooMany ||
                  check.isPending
                }
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

      {stage === 'preview' && preview && plan && (
        <>
          <h2>
            {fileName}, Period {periodNumber}
            {period && (
              <span className="hint">
                {' '}
                ({formatIsoDate(period.startDate)} – {formatIsoDate(period.endDate)})
              </span>
            )}
          </h2>
          <p className="summary-line">
            <strong>{plan.send.length} will be saved</strong>
            {server.redacted ? (
              plan.lockedOverride > 0 ? ` (${plan.lockedOverride} locked)` : ''
            ) : (
              <>
                {' '}({server.counts.new} new, {server.counts.change} changed
                {plan.lockedOverride > 0 && `, ${plan.lockedOverride} locked`})
                {' '}· {plan.unchanged} already the same
              </>
            )}
            {' '}· {plan.problemCount} problems
          </p>

          {plan.problemCount > 0 && (
            <label className="inline">
              <input
                type="checkbox"
                checked={skipProblems}
                onChange={(event) => setSkipProblems(event.target.checked)}
              />
              Skip the cells and rows with problems, and import the rest
            </label>
          )}
          {needsReason && (
            <div className="pref-group">
              <label>
                Reason for changing {plan.lockedOverride} locked score
                {plan.lockedOverride === 1 ? '' : 's'} (5 to 300 characters,
                recorded in the audit log)
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={300}
                />
              </label>
            </div>
          )}
          {plan.send.length === 0 && plan.problemCount === 0 && (
            <p>Nothing to import: every score in the file is already saved.</p>
          )}
          {plan.problemCount > 0 && !skipProblems && plan.send.length > 0 && (
            <p className="hint">
              Fix the file and choose it again, or tick the box above to import
              only what is valid.
            </p>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Student</th>
                  {preview.built.mappedParameters.map((parameter) => (
                    <th key={parameter.id}>{parameter.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.built.rows.map((item) => (
                  <tr key={item.row} className={item.rowProblem ? 'bad' : undefined}>
                    <td>{item.row}</td>
                    <td>
                      {item.student
                        ? `${item.student.fullName} (${formatStudentCode(
                            item.student.studentCode
                          )})`
                        : item.rawCode || '—'}
                    </td>
                    {item.rowProblem ? (
                      <td colSpan={preview.built.mappedParameters.length}>
                        {item.rowProblem}
                      </td>
                    ) : (
                      item.cells.map((cell) => (
                        <td key={cell.parameterId}>
                          <CellView
                            cell={cell}
                            info={serverByIndex.get(cell.entryIndex)}
                            canOverride={canOverride}
                          />
                        </td>
                      ))
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row">
            <button type="button" onClick={handleImport} disabled={!canRun}>
              {run.isPending
                ? 'Importing...'
                : `Import ${plan.send.length} score${plan.send.length === 1 ? '' : 's'}`}
            </button>
            <button type="button" onClick={backToSettings} disabled={run.isPending}>
              Back to the column settings
            </button>
            <button type="button" onClick={resetAll} disabled={run.isPending}>
              Choose another file
            </button>
          </div>
          {run.isError && (
            <>
              <p className="error" role="alert">
                {run.error.message}
              </p>
              <p className="hint">
                Something changed since the check. Go back and check the file
                again to see the current state.
              </p>
            </>
          )}
        </>
      )}

      {stage === 'done' && done && (
        <>
          <p className="success" role="status">
            Saved. {done.changed} score{done.changed === 1 ? '' : 's'} changed
            {done.unchanged > 0 && `, ${done.unchanged} already the same`}
            {done.skipped > 0 &&
              `, ${done.skipped} problem${done.skipped === 1 ? '' : 's'} skipped`}
            .
          </p>
          <div className="row">
            <Link to="/results">See the Results page</Link>
            <Link to="/evaluate">Back to Evaluate</Link>
            <button type="button" onClick={resetAll}>
              Import another file
            </button>
          </div>
        </>
      )}
    </main>
  );
}

export default ImportScoresPage;