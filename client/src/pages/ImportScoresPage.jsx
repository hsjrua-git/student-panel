import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { listPeriodParameters, saveEvaluations } from '../api/evaluations.js';
import { listParameters } from '../api/parameters.js';
import { fetchAllStudents } from '../api/students.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { errorMessage } from '../i18n/errors.js';
import EmptyState from '../components/EmptyState.jsx';
import ExportButton from '../components/ExportButton.jsx';
import ImportSteps from '../components/ImportSteps.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
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

const EMPTY = [];
const MAX_FILE_BYTES = 2_000_000;

function columnLabel(t, index, headerCells) {
  const header = headerCells ? String(headerCells[index] ?? '').trim() : '';
  return header
    ? t('imports.columnWithHeader', { index: index + 1, header })
    : t('imports.columnN', { index: index + 1 });
}

function CellView({ cell, info, canOverride }) {
  const { t } = useTranslation(['students', 'common']);
  if (cell.blank) {
    return (
      <div className="muted" title={t('imports.scores.cellEmptyTitle')}>
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
    return <div className="muted">{t('imports.scores.cellSame', { value: info.to })}</div>;
  }
  if (info.status === 'new') {
    return (
      <div>
        <strong>{info.to}</strong>{' '}
        <span className="chg">{t('imports.scores.cellNew')}</span>
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
        <strong>{info.to}</strong>{' '}
        <span className="chg">{t('imports.scores.cellSave')}</span>
      </div>
    );
  }
  return (
    <div className={canOverride ? undefined : 'error'}>
      <span className="lock" aria-hidden="true">
        <LockIcon />
      </span>{' '}
      {info.from ?? '—'} → <strong>{info.to}</strong>
      <div className="small">
        {canOverride
          ? t('imports.scores.cellLockedReason')
          : t('imports.scores.cellLockedAdmin')}
      </div>
    </div>
  );
}

function ColumnOptions({ columnCount, headerCells }) {
  const { t } = useTranslation(['students', 'common']);
  return Array.from({ length: columnCount }, (_, index) => (
    <option key={index} value={index}>
      {columnLabel(t, index, headerCells)}
    </option>
  ));
}

function ImportScoresPage() {
  const { t } = useTranslation(['students', 'common']);
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
      setParseError(t('imports.fileTooLarge', { size: '2 MB' }));
      input.value = '';
      return;
    }

    const text = (await file.text()).replace(/^\uFEFF/, '');
    const prepared = prepareRows(Papa.parse(text, { skipEmptyLines: false }).data);
    input.value = '';
    if (prepared.length === 0) {
      setParseError(t('imports.noRows'));
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
        <EmptyState
          title={t('shared.readOnlyTitle')}
          description={t('imports.scores.readOnlyDescription')}
        />
      </main>
    );
  }
  if (periodsQuery.isPending) {
    return (
      <main aria-busy="true">
        <div className="page-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>{t('common:status.loading')}</p>
        </div>
      </main>
    );
  }
  if (periodsQuery.isError) {
    return (
      <main>
        <EmptyState
          tone="danger"
          title={t('imports.scores.loadErrorTitle')}
          description={errorMessage(periodsQuery.error)}
        />
      </main>
    );
  }
  if (!periods.anchorDate) {
    return (
      <main>
        <EmptyState
          title={t('imports.scores.noCalendarTitle')}
          description={t('imports.scores.noCalendarDescription')}
        />
      </main>
    );
  }
  if (periods.current === null) {
    return (
      <main>
        <EmptyState
          title={t('imports.scores.noActiveTitle')}
          description={t('shared.period1NotStarted')}
        />
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
        <Link to="/evaluate">{t('imports.scores.back')}</Link>
      </p>
      <h1>{t('imports.scores.title')}</h1>
      <ImportSteps
        steps={[
          t('imports.stepChoose'),
          t('imports.stepReview'),
          t('common:actions.done'),
        ]}
        current={stage === 'choose' ? 0 : stage === 'preview' ? 1 : 2}
      />

      {stage === 'choose' && (
        <>
          <p className="hint">{t('imports.scores.hint')}</p>
          <PeriodPicker
            periods={periods}
            value={periodNumber}
            onChange={setChosenPeriod}
          />

          <p>
            <ExportButton
              label={t('imports.scores.templateLabel', { period: periodNumber })}
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
              {t('imports.scores.noParamsInPeriod', { period: periodNumber })}
            </p>
          )}

          <div className="drop-zone">
            <span className="drop-zone-mark">
              <UploadIcon />
            </span>
            <input
              type="file"
              accept=".csv,.txt,text/csv"
              aria-label={t('imports.scores.fileAria')}
              onChange={handleFile}
            />
          </div>
          {parseError && (
            <p className="error" role="alert">
              {parseError}
            </p>
          )}
          {rows.length > 0 && studentsQuery.isPending && (
            <p className="hint">{t('list.loading')}</p>
          )}
          {studentsQuery.isError && (
            <p className="error" role="alert">
              {errorMessage(studentsQuery.error)}
            </p>
          )}

          {rows.length > 0 && (
            <section className="section-card">
              <h2>{fileName}</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('imports.row')}</th>
                      {Array.from({ length: columnCount }, (_, index) => (
                        <th key={index}>{columnLabel(t, index, null)}</th>
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
                  {t('imports.showingFirst', { count: rows.length })}
                </p>
              )}

              <div className="pref-group">
                <label className="inline">
                  <input
                    type="checkbox"
                    checked={hasHeader}
                    onChange={(event) => setHasHeader(event.target.checked)}
                  />
                  {t('imports.firstRowHeader')}
                </label>
                <label className="inline">
                  {t('imports.scores.codeIn')}
                  <select
                    value={codeColumn}
                    onChange={(event) => setCodeChoice(Number(event.target.value))}
                  >
                    <ColumnOptions columnCount={columnCount} headerCells={headerCells} />
                  </select>
                </label>
                <label className="inline">
                  {t('imports.scores.nameCheck')}
                  <select
                    value={nameColumn ?? ''}
                    onChange={(event) =>
                      setNameChoice(
                        event.target.value === '' ? null : Number(event.target.value)
                      )
                    }
                  >
                    <option value="">{t('imports.scores.noNameColumn')}</option>
                    <ColumnOptions columnCount={columnCount} headerCells={headerCells} />
                  </select>
                </label>
              </div>

              <h3>{t('imports.scores.whichColumns')}</h3>
              {!hasHeader && (
                <p className="hint">{t('imports.scores.noHeaderHint')}</p>
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
                      <option value="">{t('imports.scores.notInFile')}</option>
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
                  {t('imports.scores.ignoredColumns', {
                    names: ignoredHeaders.join(', '),
                  })}
                </p>
              )}
              {notUsedHere.length > 0 && (
                <p className="hint">
                  {t('imports.scores.notUsedHere', {
                    period: periodNumber,
                    names: notUsedHere.join(', '),
                  })}
                </p>
              )}

              {built && (
                <p className="summary-line">
                  {t('imports.scores.summaryLine', {
                    rows: built.rows.length,
                    matched: built.rows.filter((item) => !item.rowProblem).length,
                    scores: built.entries.length,
                  })}
                  {built.localProblemCount > 0 &&
                    t('imports.scores.problemsNote', {
                      count: built.localProblemCount,
                    })}
                </p>
              )}
              {tooMany && (
                <p className="error">
                  {t('imports.scores.tooMany', {
                    count: built.entries.length,
                    max: MAX_SCORE_CELLS,
                  })}
                </p>
              )}
              {built && built.entries.length === 0 && (
                <p className="error">{t('imports.scores.noScores')}</p>
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
                {check.isPending
                  ? t('imports.checking')
                  : t('imports.checkFile')}
              </button>
              {check.isError && (
                <p className="error" role="alert">
                  {errorMessage(check.error)}
                </p>
              )}
            </section>
          )}
        </>
      )}

      {stage === 'preview' && preview && plan && (
        <section className="section-card">
          <h2>
            {t('imports.scores.previewTitle', {
              name: fileName,
              period: periodNumber,
            })}
            {period && (
              <span className="hint">
                {' '}
                ({formatIsoDate(period.startDate)} – {formatIsoDate(period.endDate)})
              </span>
            )}
          </h2>
          <p className="summary-line">
            <strong>
              {t('imports.scores.willBeSaved', { count: plan.send.length })}
            </strong>
            {server.redacted ? (
              plan.lockedOverride > 0
                ? t('imports.scores.lockedSuffix', { count: plan.lockedOverride })
                : ''
            ) : (
              <>
                {t('imports.scores.countsOpen', {
                  new: server.counts.new,
                  changed: server.counts.change,
                })}
                {plan.lockedOverride > 0 &&
                  t('imports.scores.countsLocked', { count: plan.lockedOverride })}
                {t('imports.scores.countsClose', { count: plan.unchanged })}
              </>
            )}
            {t('imports.scores.problemsTail', { count: plan.problemCount })}
          </p>

          {plan.problemCount > 0 && (
            <label className="inline">
              <input
                type="checkbox"
                checked={skipProblems}
                onChange={(event) => setSkipProblems(event.target.checked)}
              />
              {t('imports.scores.skipProblems')}
            </label>
          )}
          {needsReason && (
            <div className="pref-group">
              <label>
                {t('imports.scores.reasonLabel', {
                  count: plan.lockedOverride,
                })}
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={300}
                />
              </label>
            </div>
          )}
          {plan.send.length === 0 && plan.problemCount === 0 && (
            <p>{t('imports.scores.nothingToImport')}</p>
          )}
          {plan.problemCount > 0 && !skipProblems && plan.send.length > 0 && (
            <p className="hint">{t('imports.scores.fixOrSkip')}</p>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('imports.row')}</th>
                  <th>{t('imports.scores.colStudent')}</th>
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
                ? t('imports.importing')
                : t('imports.scores.importButton', { count: plan.send.length })}
            </button>
            <button type="button" onClick={backToSettings} disabled={run.isPending}>
              {t('imports.scores.backToColumns')}
            </button>
            <button type="button" onClick={resetAll} disabled={run.isPending}>
              {t('imports.chooseAnotherFile')}
            </button>
          </div>
          {run.isError && (
            <>
              <p className="error" role="alert">
                {errorMessage(run.error)}
              </p>
              <p className="hint">{t('imports.scores.staleHint')}</p>
            </>
          )}
        </section>
      )}

      {stage === 'done' && done && (
        <section className="section-card">
          <p className="success" role="status">
            {t('imports.scores.savedPrefix', { count: done.changed })}
            {done.unchanged > 0 &&
              t('imports.scores.sameSuffix', { count: done.unchanged })}
            {done.skipped > 0 &&
              t('imports.scores.skippedProblems', { count: done.skipped })}
            {'.'}
          </p>
          <div className="row">
            <Link to="/results">{t('imports.scores.seeResults')}</Link>
            <Link to="/evaluate">{t('imports.scores.backToEvaluate')}</Link>
            <button type="button" onClick={resetAll}>
              {t('imports.importAnotherFile')}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

export default ImportScoresPage;