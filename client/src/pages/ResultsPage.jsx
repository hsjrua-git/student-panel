import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { getResults } from '../api/results.js';
import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
  updateSavedView,
} from '../api/savedViews.js';
import { useAuth } from '../auth/AuthContext.jsx';
import FilterEditor from '../components/FilterEditor.jsx';
import GroupFilter from '../components/GroupFilter.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import ResultsTable from '../components/ResultsTable.jsx';
import SavedViewsBar from '../components/SavedViewsBar.jsx';
import { formatIsoDate } from '../lib/format.js';
import {
  applyView,
  defaultConfig,
  describeFilter,
  normalizeConfig,
  sameConfig,
  toggleColumn,
  toggleSort,
  withFilterKeys,
} from '../lib/resultsView.js';
import { usePeriods } from '../lib/usePeriods.js';
import ExportButton from '../components/ExportButton.jsx';
import { resultsCsvRows } from '../lib/exports.js';

const EMPTY = [];

function ResultsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const periodsQuery = usePeriods();
  const periods = periodsQuery.data;

  const [config, setConfig] = useState(() => withFilterKeys(defaultConfig()));
  const [activeView, setActiveView] = useState(null);
  const [groupId, setGroupId] = useState('');

  const current = periods?.current ?? null;
  let periodNumber = current;
  if (
    current !== null &&
    config.periodMode === 'fixed' &&
    config.periodNumber !== null &&
    config.periodNumber <= current
  ) {
    periodNumber = config.periodNumber;
  }

  const resultsQuery = useQuery({
    queryKey: ['results', periodNumber, groupId],
    queryFn: () => getResults(periodNumber, groupId || null),
    enabled: periodNumber !== null,
  });
  const viewsQuery = useQuery({
    queryKey: ['saved-views'],
    queryFn: listSavedViews,
  });

  function refreshViews() {
    queryClient.invalidateQueries({ queryKey: ['saved-views'] });
  }

  const create = useMutation({
    mutationFn: createSavedView,
    onSuccess: (view) => {
      setActiveView(view);
      refreshViews();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, fields }) => updateSavedView(id, fields),
    onSuccess: (view) => {
      setActiveView(view);
      refreshViews();
    },
  });
  const remove = useMutation({
    mutationFn: deleteSavedView,
    onSuccess: () => {
      setActiveView(null);
      refreshViews();
    },
  });

  const busy = create.isPending || update.isPending || remove.isPending;
  const actionError =
    create.error?.message ??
    update.error?.message ??
    remove.error?.message ??
    null;

  function resetErrors() {
    create.reset();
    update.reset();
    remove.reset();
  }

  const parameters = resultsQuery.data?.parameters ?? EMPTY;
  const students = resultsQuery.data?.students ?? EMPTY;
  const parametersById = useMemo(
    () => new Map(parameters.map((parameter) => [parameter.id, parameter])),
    [parameters]
  );
  const view = useMemo(
    () => applyView({ students, parameters, config }),
    [students, parameters, config]
  );

  const chosenColumns =
    config.parameterIds.length === 0
      ? parameters
      : parameters.filter((parameter) => config.parameterIds.includes(parameter.id));
  const columns = chosenColumns.length > 0 ? chosenColumns : parameters;
  const allIds = parameters.map((parameter) => parameter.id);
  const dirty = activeView !== null && !sameConfig(config, activeView.config);

  function patch(changes) {
    setConfig((existing) => ({ ...existing, ...changes }));
  }

  function handlePeriodChange(number) {
    patch(
      number === current
        ? { periodMode: 'current', periodNumber: null }
        : { periodMode: 'fixed', periodNumber: number }
    );
  }

  function handleLoad(id) {
    resetErrors();
    if (!id) {
      setActiveView(null);
      return;
    }
    const found = viewsQuery.data?.find((item) => item.id === id);
    if (!found) return;
    setConfig(withFilterKeys(normalizeConfig(found.config)));
    setActiveView(found);
  }

  function handleSaveAs() {
    const name = window.prompt('Name for this view (up to 60 characters):');
    if (name === null || name.trim() === '') return;
    resetErrors();
    create.mutate({ name, config: normalizeConfig(config) });
  }

  function handleUpdate() {
    resetErrors();
    update.mutate({
      id: activeView.id,
      fields: { config: normalizeConfig(config) },
    });
  }

  function handleRename() {
    const name = window.prompt('New name:', activeView.name);
    if (name === null || name.trim() === '') return;
    resetErrors();
    update.mutate({ id: activeView.id, fields: { name } });
  }

  function handleDelete() {
    if (!window.confirm(`Delete the view "${activeView.name}"?`)) return;
    resetErrors();
    remove.mutate(activeView.id);
  }

  function handleReset() {
    resetErrors();
    setConfig(withFilterKeys(defaultConfig()));
    setActiveView(null);
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
        <h1>Results</h1>
        {can('settings.manage') ? (
          <p>
            Set the period start date first, on the{' '}
            <Link to="/settings">Settings</Link> page.
          </p>
        ) : (
          <p>An administrator needs to set the period start date first.</p>
        )}
      </main>
    );
  }
  if (periods.current === null) {
    return (
      <main>
        <h1>Results</h1>
        <p>Period 1 has not started yet.</p>
      </main>
    );
  }

  const data = resultsQuery.data;
  const filterTexts = config.filters.map((filter) =>
    describeFilter(filter, parametersById)
  );

  return (
    <main className="wide results">
      <h1>Results</h1>
      <p className="hint">
        Compare all students in one period. Filter, sort, and save the setup as
        a named view.
      </p>

      <div className="toolbar">
        <PeriodPicker
          periods={periods}
          value={periodNumber}
          onChange={handlePeriodChange}
        />
        <GroupFilter value={groupId} onChange={setGroupId} />
      </div>

      <SavedViewsBar
        views={viewsQuery.data ?? EMPTY}
        activeId={activeView?.id ?? null}
        dirty={dirty}
        busy={busy}
        error={actionError}
        onLoad={handleLoad}
        onSaveAs={handleSaveAs}
        onUpdate={handleUpdate}
        onRename={handleRename}
        onDelete={handleDelete}
        onReset={handleReset}
      />

      <div className="toolbar">
        <input
          type="search"
          className="search"
          value={config.search}
          onChange={(event) => patch({ search: event.target.value })}
          placeholder="Search by name or code"
          aria-label="Search students"
        />
        <label className="inline">
          <input
            type="checkbox"
            checked={config.showChange}
            onChange={(event) => patch({ showChange: event.target.checked })}
          />
          Show change vs previous period
        </label>
        {can('data.export') && (
          <ExportButton
            label="Export this table (CSV)"
            filename={`results-period-${periodNumber}.csv`}
            disabled={!data || parameters.length === 0 || view.rows.length === 0}
            buildRows={() =>
              resultsCsvRows({
                periodNumber,
                columns,
                rows: view.rows,
                showChange: config.showChange,
              })
            }
          />
        )}
      </div>

      {parameters.length > 0 && (
        <details className="panel">
          <summary>
            Columns ({columns.length} of {parameters.length})
          </summary>
          <div className="columns-list">
            {parameters.map((parameter) => (
              <label key={parameter.id} className="inline">
                <input
                  type="checkbox"
                  checked={columns.some((column) => column.id === parameter.id)}
                  onChange={(event) =>
                    patch({
                      parameterIds: toggleColumn(
                        config.parameterIds,
                        allIds,
                        parameter.id,
                        event.target.checked
                      ),
                    })
                  }
                />
                {parameter.name}
              </label>
            ))}
          </div>
        </details>
      )}

      <section>
        <h2>Filters</h2>
        <FilterEditor
          filters={config.filters}
          parameters={parameters}
          onChange={(filters) => patch({ filters })}
        />
      </section>

      {resultsQuery.isPending && <p>Loading...</p>}
      {resultsQuery.isError && (
        <p className="error">{resultsQuery.error.message}</p>
      )}

      {data && (
        <section>
          <p className="summary-line">
            Period {data.periodNumber} ({formatIsoDate(data.startDate)} –{' '}
            {formatIsoDate(data.endDate)}) · Showing {view.rows.length} of{' '}
            {students.length} students
            {filterTexts.length > 0 && <> · Filters: {filterTexts.join('; ')}</>}
          </p>
          {data.truncated && (
            <p className="hint">
              Only the first {students.length} of {data.total} students are
              included.
            </p>
          )}
          {view.ignoredFilters > 0 && (
            <p className="hint">
              {view.ignoredFilters} filter{view.ignoredFilters === 1 ? '' : 's'}{' '}
              refer to parameters this period does not use, and{' '}
              {view.ignoredFilters === 1 ? 'is' : 'are'} ignored.
            </p>
          )}

          {parameters.length === 0 ? (
            <p>
              No parameters were used in this period and no scores were entered.
            </p>
          ) : view.rows.length === 0 ? (
            <p>
              No students match.{' '}
              <button type="button" onClick={() => patch({ filters: [], search: '' })}>
                Clear filters and search
              </button>
            </p>
          ) : (
            <ResultsTable
              rows={view.rows}
              columns={columns}
              stats={view.stats}
              sort={config.sort}
              onSort={(key) => patch({ sort: toggleSort(config.sort, key) })}
              showChange={config.showChange}
              periodNumber={data.periodNumber}
            />
          )}
        </section>
      )}
    </main>
  );
}

export default ResultsPage;