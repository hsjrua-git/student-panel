import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import { Link } from 'react-router';
import { getMatrix, saveEvaluations } from '../api/evaluations.js';
import { listParameters } from '../api/parameters.js';
import { listGroups } from '../api/groups.js';
import EmptyState from '../components/EmptyState.jsx';
import ExportButton from '../components/ExportButton.jsx';
import ImportSteps from '../components/ImportSteps.jsx';
import { LockIcon, UploadIcon } from '../components/icons.jsx';
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

// Bulk score import, in the per-group model. The operator picks the group and
// period they are importing into, then a CSV with one row per student (found by
// code) and one column per leaf parameter. Scores are kept per group, so every
// entry is tagged with the chosen groupId before it is sent. The flow mirrors
// the Evaluate page: a dry-run "check" previews what would change, then the
// real save goes through PUT /evaluations/bulk with lock/override handling.

const EMPTY = [];
const MAX_FILE_BYTES = 2_000_000;

function columnLabel(index, headerCells) {
  const header = headerCells ? String(headerCells[index] ?? '').trim() : '';
  return header ? `Column ${index + 1}: ${header}` : `Column ${index + 1}`;
}

function ColumnOptions({ columnCount, headerCells }) {
  return Array.from({ length: columnCount }, (_, index) => (
    <option key={index} value={index}>
      {columnLabel(index, headerCells)}
    </option>
  ));
}

// One cell in the preview table. `cell` is the local parse result (blank /
// problem / value); `info` is the server's dry-run verdict for the matching
// entry index, or a per-index problem ({ status: 'problem', message }). The
// server cell shape is { status: 'unchanged' | 'changed' | 'cleared', from,
// to, wasLocked }.
function CellView({ cell, info }) {
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
  if (info.wasLocked) {
    return (
      <div>
        <span className="lock" aria-hidden="true">
          <LockIcon />
        </span>{' '}
        {info.from ?? '—'} → <strong>{info.to}</strong>
        <div className="small">Locked. Needs a reason.</div>
      </div>
    );
  }
  if (info.from === null || info.from === undefined) {
    return (
      <div>
        <strong>{info.to}</strong> <span className="chg">new</span>
      </div>
    );
  }
  return (
    <div>
      {info.from} → <strong>{info.to}</strong>
    </div>
  );
}

function ImportScoresPage() {
  const queryClient = useQueryClient();
  const periodsQuery = usePeriods();
  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: () => listGroups(),
  });
  const allParamsQuery = useQuery({
    queryKey: ['parameters'],
    queryFn: () => listParameters(),
  });

  const periods = periodsQuery.data ?? EMPTY;
  const groups = groupsQuery.data ?? EMPTY;

  const [groupId, setGroupId] = useState('');
  const [periodId, setPeriodId] = useState('');
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

  const ready = groupId !== '' && periodId !== '';
  const matrixQuery = useQuery({
    queryKey: ['matrix', { groupId, periodId }],
    queryFn: () => getMatrix({ groupId, periodId }),
    enabled: ready,
  });
  const matrix = matrixQuery.data;

  // The matrix supplies both the leaf parameters that apply to this group in
  // this period and the member list (as 'student' columns). That member list
  // is what rows are matched against by code — and it naturally restricts the
  // import to this group's members (the server validates membership too).
  const scoreParameters = matrix?.parameters ?? EMPTY;
  const members = useMemo(
    () => (matrix?.columns ?? EMPTY).filter((column) => column.kind === 'student'),
    [matrix],
  );
  const studentsByCode = useMemo(
    () =>
      new Map(
        members.map((member) => [
          normalizeCode(member.studentCode),
          {
            id: member.studentId,
            fullName: member.label,
            studentCode: member.studentCode,
          },
        ]),
      ),
    [members],
  );

  const check = useMutation({ mutationFn: saveEvaluations });
  const run = useMutation({ mutationFn: saveEvaluations });

  const guess = useMemo(
    () =>
      hasHeader && rows.length > 0
        ? guessLayout(rows[0].cells, scoreParameters)
        : { codeColumn: null, nameColumn: null, mapping: {} },
    [hasHeader, rows, scoreParameters],
  );
  const codeColumn = codeChoice ?? guess.codeColumn ?? 0;
  const nameColumn = nameChoice === undefined ? guess.nameColumn : nameChoice;
  const mapping = useMemo(
    () => ({ ...guess.mapping, ...mappingChoice }),
    [guess, mappingChoice],
  );

  const built = useMemo(() => {
    if (rows.length === 0 || !matrix) return null;
    return buildImport({
      rows,
      hasHeader,
      codeColumn,
      nameColumn,
      mapping,
      parameters: scoreParameters,
      studentsByCode,
    });
  }, [
    rows,
    hasHeader,
    codeColumn,
    nameColumn,
    mapping,
    scoreParameters,
    studentsByCode,
    matrix,
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

  function clearImport() {
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

  function pickGroup(value) {
    setGroupId(value);
    clearImport();
  }

  function pickPeriod(value) {
    setPeriodId(value);
    clearImport();
  }

  async function handleFile(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    clearImport();
    setFileName(file.name);
    if (file.size > MAX_FILE_BYTES) {
      setParseError('This file is larger than 2 MB. Split it into smaller files.');
      input.value = '';
      return;
    }
    let text = await file.text();
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const parsed = Papa.parse(text, { skipEmptyLines: false });
    const prepared = prepareRows(parsed.data);
    input.value = '';
    if (prepared.length === 0) {
      setParseError('The file has no rows.');
      return;
    }
    setRows(prepared);
    setHasHeader(looksLikeScoreHeader(prepared[0].cells, scoreParameters));
  }

  function handleCheck() {
    if (!built) return;
    check.mutate(
      {
        periodId,
        entries: built.entries.map((entry) => ({ ...entry, groupId })),
        dryRun: true,
      },
      {
        onSuccess: (server) => {
          setPreview({ built, server });
          setStage('preview');
        },
      },
    );
  }

  function backToSettings() {
    setStage('choose');
    setPreview(null);
    setSkipProblems(false);
    setReason('');
    check.reset();
    run.reset();
  }

  // canOverride is always true for the single operator; planImport keeps the
  // flag only so its logic stays pure/testable.
  const plan = preview
    ? planImport({ built: preview.built, server: preview.server, canOverride: true })
    : null;
  const needsReason = plan !== null && plan.lockedOverride > 0;
  const canRun =
    plan !== null &&
    plan.send.length > 0 &&
    (plan.problemCount === 0 || skipProblems) &&
    (!needsReason || reasonValid(reason)) &&
    !run.isPending;

  function handleImport() {
    if (!plan) return;
    run.mutate(
      {
        periodId,
        entries: plan.send.map((entry) => ({ ...entry, groupId })),
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
          queryClient.invalidateQueries({ queryKey: ['matrix'] });
          queryClient.invalidateQueries({ queryKey: ['evaluations'] });
          queryClient.invalidateQueries({ queryKey: ['results'] });
          queryClient.invalidateQueries({ queryKey: ['trends'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
        },
      },
    );
  }

  if (periodsQuery.isPending || groupsQuery.isPending) {
    return (
      <main aria-busy="true">
        <div className="page-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Loading…</p>
        </div>
      </main>
    );
  }
  if (periodsQuery.isError || groupsQuery.isError) {
    return (
      <main>
        <EmptyState
          tone="danger"
          title="Couldn't load groups or periods"
          description={(periodsQuery.error ?? groupsQuery.error).message}
        />
      </main>
    );
  }

  const selectedPeriod = periods.find((item) => item.id === periodId) ?? null;
  const selectedGroup = groups.find((item) => item.id === groupId) ?? null;

  const columnCount = rows.reduce(
    (max, item) => Math.max(max, item.cells.length),
    0,
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
  // Of the ignored headers, flag any that name a real parameter — a hint that a
  // parameter does not apply to this group in this period, rather than a typo.
  const notUsedHere = ignoredHeaders.filter((text) =>
    (allParamsQuery.data ?? EMPTY).some(
      (parameter) => nameKey(parameter.name) === nameKey(text),
    ),
  );

  const tooMany = built !== null && built.entries.length > MAX_SCORE_CELLS;
  const stepIndex = stage === 'choose' ? 0 : stage === 'preview' ? 1 : 2;

  return (
    <main className="wide">
      <p>
        <Link to="/evaluate">← Back to Evaluate</Link>
      </p>
      <h1>Import scores</h1>
      <ImportSteps steps={['Choose a file', 'Review', 'Done']} current={stepIndex} />

      {stage === 'choose' && (
        <>
          <p className="hint">
            Scores are kept per group. Pick the group and period you are
            importing into, then choose a CSV file with one row per student.
            Each student is found by their code, and each score column by its
            parameter name. Empty cells are ignored — they never clear an
            existing score.
          </p>

          {groups.length === 0 ? (
            <EmptyState
              title="No groups yet"
              description="Create a group and add students to it before importing scores."
            />
          ) : periods.length === 0 ? (
            <EmptyState
              title="No periods yet"
              description="Create a period on the Periods page before importing scores."
            />
          ) : (
            <>
              <div className="control-bar">
                <label className="group-filter">
                  Group
                  <select
                    value={groupId}
                    onChange={(event) => pickGroup(event.target.value)}
                  >
                    <option value="">Choose a group…</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="group-filter">
                  Period
                  <select
                    value={periodId}
                    onChange={(event) => pickPeriod(event.target.value)}
                  >
                    <option value="">Choose a period…</option>
                    {periods.map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {!ready && (
                <p className="hint">Pick a group and a period to continue.</p>
              )}
              {ready && matrixQuery.isPending && <p className="hint">Loading…</p>}
              {ready && matrixQuery.isError && (
                <p className="error" role="alert">
                  {matrixQuery.error.message}
                </p>
              )}
              {ready && matrix && members.length === 0 && (
                <p className="error">
                  This group has no students, so there is nothing to import into
                  it. Add members on the group's page first.
                </p>
              )}
              {ready && matrix && members.length > 0 && scoreParameters.length === 0 && (
                <p className="error">
                  No parameters apply to this group in this period, so there is
                  nothing to import.
                </p>
              )}

              {ready &&
                matrix &&
                members.length > 0 &&
                scoreParameters.length > 0 && (
                  <>
                    <p>
                      <ExportButton
                        label="Download a template"
                        filename={`score-template-${selectedGroup?.name ?? 'group'}.csv`}
                        buildRows={() =>
                          scoreTemplateCsvRows({
                            students: members.map((member) => ({
                              studentCode: member.studentCode,
                              fullName: member.label,
                            })),
                            parameters: scoreParameters,
                          })
                        }
                      />
                    </p>

                    <div className="drop-zone">
                      <span className="drop-zone-mark">
                        <UploadIcon />
                      </span>
                      <input
                        type="file"
                        accept=".csv,.txt,text/csv"
                        aria-label="Choose a CSV file of scores to import"
                        onChange={handleFile}
                      />
                    </div>
                    {parseError && (
                      <p className="error" role="alert">
                        {parseError}
                      </p>
                    )}

                    {rows.length > 0 && (
                      <section className="section-card">
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
                          <p className="hint">
                            Showing the first 5 of {rows.length} rows.
                          </p>
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
                              onChange={(event) =>
                                setCodeChoice(Number(event.target.value))
                              }
                            >
                              <ColumnOptions
                                columnCount={columnCount}
                                headerCells={headerCells}
                              />
                            </select>
                          </label>
                          <label className="inline">
                            Name (only to double-check the code)
                            <select
                              value={nameColumn ?? ''}
                              onChange={(event) =>
                                setNameChoice(
                                  event.target.value === ''
                                    ? null
                                    : Number(event.target.value),
                                )
                              }
                            >
                              <option value="">No name column</option>
                              <ColumnOptions
                                columnCount={columnCount}
                                headerCells={headerCells}
                              />
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
                          {scoreParameters.map((parameter) => (
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
                            {notUsedHere.length === 1
                              ? 'is a parameter that does'
                              : 'are parameters that do'}{' '}
                            not apply to this group in this period, so{' '}
                            {notUsedHere.length === 1 ? 'it is' : 'they are'}{' '}
                            ignored.
                          </p>
                        )}

                        {built && (
                          <p className="summary-line">
                            {built.rows.length} rows read ·{' '}
                            {built.rows.filter((item) => !item.rowProblem).length}{' '}
                            matched to a student · {built.entries.length} scores
                            to check
                            {built.blankCells > 0 && (
                              <> · {built.blankCells} blank cells ignored</>
                            )}
                          </p>
                        )}
                        {tooMany && (
                          <p className="error">
                            This file has {built.entries.length} scores. Import at
                            most {MAX_SCORE_CELLS} at a time.
                          </p>
                        )}
                        {built && built.entries.length === 0 && !tooMany && (
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
                          {check.isPending ? 'Checking…' : 'Check the file'}
                        </button>
                        {check.isError && (
                          <p className="error" role="alert">
                            {check.error.message}
                          </p>
                        )}
                      </section>
                    )}
                  </>
                )}
            </>
          )}
        </>
      )}

      {stage === 'preview' && preview && plan && (
        <section className="section-card">
          <h2>
            {fileName}
            {selectedGroup && <> · {selectedGroup.name}</>}
          </h2>
          <p className="hint">
            {selectedPeriod?.name}
            {selectedPeriod?.startDate && (
              <>
                {' '}({formatIsoDate(selectedPeriod.startDate)} –{' '}
                {formatIsoDate(selectedPeriod.endDate)})
              </>
            )}
          </p>
          <p className="summary-line">
            <strong>
              {plan.send.length} will be saved
            </strong>
            {plan.lockedOverride > 0 && ` (${plan.lockedOverride} locked)`} ·{' '}
            {plan.unchanged} already the same · {plan.problemCount} with problems
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
                        ? `${item.student.fullName} (${formatStudentCode(item.student.studentCode)})`
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
                ? 'Importing…'
                : `Import ${plan.send.length} score${plan.send.length === 1 ? '' : 's'}`}
            </button>
            <button type="button" onClick={backToSettings} disabled={run.isPending}>
              Back to the column settings
            </button>
            <button type="button" onClick={clearImport} disabled={run.isPending}>
              Choose another file
            </button>
          </div>
          {run.isError && (
            <>
              <p className="error" role="alert">
                {run.error.message}
              </p>
              <p className="hint">
                Something may have changed since the check. Go back and check the
                file again to see the current state.
              </p>
            </>
          )}
        </section>
      )}

      {stage === 'done' && done && (
        <section className="section-card">
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
            <button type="button" onClick={clearImport}>
              Import another file
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

export default ImportScoresPage;

