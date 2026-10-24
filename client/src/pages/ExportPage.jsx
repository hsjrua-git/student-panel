import { useCallback, useMemo, useReducer, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { usePeriods } from '../lib/usePeriods.js';
import { listParameters, listParameterChanges } from '../api/parameters.js';
import { fetchAuditTrail } from '../api/audit.js';
import { fetchCube } from '../api/export.js';
import { buildCube } from '../lib/cube.js';
import {
  exportConfigErrors,
  includesTabular,
  mergePrefill,
} from '../lib/exportConfig.js';
import { errorMessage } from '../i18n/errors.js';
import EmptyState from '../components/EmptyState.jsx';
import FilterEditor from '../components/FilterEditor.jsx';
import ExportStudentPicker from '../components/ExportStudentPicker.jsx';
import ExportParameterPicker from '../components/ExportParameterPicker.jsx';
import PeriodRangePicker from '../components/PeriodRangePicker.jsx';
import IncludePicker from '../components/IncludePicker.jsx';
import FormatPicker from '../components/FormatPicker.jsx';
import ChartConfigPanel from '../components/ChartConfigPanel.jsx';
import ExportPreview from '../components/ExportPreview.jsx';
import ExportRunButton from '../components/ExportRunButton.jsx';

const EMPTY = [];

// The whole config lives in one object; every picker hands back a full slice (or,
// for the format picker, a small patch), so a shallow merge is all the reducer
// needs. Shape, defaults and validation live in lib/exportConfig.js.
function reducer(state, patch) {
  return { ...state, ...patch };
}

function ExportPage() {
  const { t } = useTranslation(['reports', 'common']);
  const location = useLocation();
  const periodsQuery = usePeriods();
  const periods = periodsQuery.data;

  const [config, dispatch] = useReducer(
    reducer,
    location.state?.export,
    (prefill) => mergePrefill(prefill)
  );

  const parametersQuery = useQuery({ queryKey: ['parameters'], queryFn: listParameters });
  const parameters = parametersQuery.data ?? EMPTY;

  // Periods that have actually started (≤ current), then narrowed to the mode.
  const available = useMemo(
    () =>
      periods?.current
        ? periods.periods.map((period) => period.number).filter((n) => n <= periods.current)
        : [],
    [periods]
  );
  const resolvedPeriods = useMemo(() => {
    const { mode, from, to, numbers } = config.periods;
    if (mode === 'range' && from !== null && to !== null) {
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      return available.filter((n) => n >= lo && n <= hi);
    }
    if (mode === 'selection') {
      const want = new Set(numbers);
      return available.filter((n) => want.has(n));
    }
    return available;
  }, [config.periods, available]);

  // Resolve the scope to the concrete values api/export.js#fetchCube expects.
  const scope = useMemo(
    () => ({
      periods: resolvedPeriods,
      groupId: config.students.mode === 'group' ? config.students.groupId : null,
      studentIds: config.students.mode === 'selection' ? config.students.ids : [],
      parameterIds: config.parameters.mode === 'selection' ? config.parameters.ids : [],
    }),
    [resolvedPeriods, config.students, config.parameters]
  );

  const ready = Boolean(periods && periods.current !== null);
  const cubeQuery = useQuery({
    queryKey: ['export-cube', scope],
    queryFn: () => fetchCube(scope),
    enabled: ready && scope.periods.length > 0,
  });
  const cube = useMemo(
    () => (cubeQuery.data ? buildCube({ ...cubeQuery.data, filters: config.filters }) : null),
    [cubeQuery.data, config.filters]
  );

  // Change-history sources, fetched only when their content type is selected.
  const changesQuery = useQuery({
    queryKey: ['parameter-changes'],
    queryFn: listParameterChanges,
    enabled: config.include.trackingLog,
  });
  const auditQuery = useQuery({
    queryKey: ['audit-trail'],
    queryFn: () => fetchAuditTrail({}),
    enabled: config.include.auditTrail,
  });

  // Each chart registers its rendered container so the run can read its <svg>.
  const chartNodes = useRef(new Map());
  const registerChart = useCallback((index, node) => {
    if (node) chartNodes.current.set(index, node);
    else chartNodes.current.delete(index);
  }, []);

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
          title={t('export.errorTitle')}
          description={errorMessage(periodsQuery.error)}
        />
      </main>
    );
  }
  if (!periods.anchorDate) {
    return (
      <main>
        <h1>{t('export.title')}</h1>
        <EmptyState
          title={t('setup.title')}
          description={t('export.setupHint')}
        />
      </main>
    );
  }
  if (periods.current === null) {
    return (
      <main>
        <h1>{t('export.title')}</h1>
        <EmptyState
          title={t('setup.notStartedTitle')}
          description={t('export.notStartedHint')}
        />
      </main>
    );
  }

  const errors = exportConfigErrors(config);
  const changesLoading = config.include.trackingLog && changesQuery.isPending;
  const auditLoading = config.include.auditTrail && auditQuery.isPending;
  const runDisabled = errors.length > 0 || !cube || changesLoading || auditLoading;
  const truncated = cubeQuery.data?.truncated;

  return (
    <main className="wide export-center">
      <h1>{t('export.title')}</h1>
      <p className="hint">{t('export.subtitle')}</p>

      <div className="export-layout">
        <div className="export-config">
          <ExportStudentPicker
            value={config.students}
            onChange={(students) => dispatch({ students })}
          />
          <ExportParameterPicker
            value={config.parameters}
            parameters={parameters}
            onChange={(next) => dispatch({ parameters: next })}
          />
          <PeriodRangePicker
            value={config.periods}
            periods={periods}
            onChange={(next) => dispatch({ periods: next })}
          />
          <section className="section-card">
            <h2 className="group-title">{t('filter.title')}</h2>
            <FilterEditor
              filters={config.filters}
              parameters={parameters}
              onChange={(filters) => dispatch({ filters })}
            />
          </section>
          <IncludePicker
            value={config.include}
            onChange={(include) => dispatch({ include })}
          />
          <FormatPicker
            format={config.tabularFormat}
            layout={config.layout}
            showLayout={config.include.data}
            onChange={(patch) => dispatch(patch)}
          />
          <ChartConfigPanel
            value={config.charts}
            parameters={parameters}
            periodNumbers={resolvedPeriods}
            current={periods.current}
            onChange={(charts) => dispatch({ charts })}
          />
        </div>

        <div className="export-output">
          <div className="export-run-bar">
            <ExportRunButton
              config={config}
              cube={cube}
              scope={scope}
              changes={changesQuery.data ?? EMPTY}
              auditEntries={auditQuery.data?.entries ?? EMPTY}
              chartNodes={chartNodes}
              disabled={runDisabled}
            />
            {errors.length > 0 && (
              <ul className="export-errors">
                {errors.map((message) => (
                  <li key={message} className="hint">
                    {message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {scope.periods.length === 0 && (
            <p className="hint">{t('export.noPeriods')}</p>
          )}
          {cubeQuery.isPending && scope.periods.length > 0 && (
            <p className="hint">{t('export.loadingData')}</p>
          )}
          {cubeQuery.isError && (
            <p className="error">{errorMessage(cubeQuery.error)}</p>
          )}
          {(changesLoading || auditLoading) && (
            <p className="hint">{t('export.loadingChanges')}</p>
          )}
          {truncated && (
            <p className="hint">
              {t('export.truncated', {
                count: cubeQuery.data.students.length,
              })}
            </p>
          )}

          {cube &&
            (includesTabular(config) || config.charts.length > 0 ? (
              <ExportPreview config={config} cube={cube} registerChart={registerChart} />
            ) : (
              <p className="hint">{t('export.chooseSomething')}</p>
            ))}
        </div>
      </div>
    </main>
  );
}

export default ExportPage;

