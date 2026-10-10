import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { getMatrix } from '../api/evaluations.js';
import { listGroups } from '../api/groups.js';
import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
  updateSavedView,
} from '../api/savedViews.js';
import EmptyState from '../components/EmptyState.jsx';
import ExportButton from '../components/ExportButton.jsx';
import FilterEditor from '../components/FilterEditor.jsx';
import ResultsTable from '../components/ResultsTable.jsx';
import SavedViewsBar from '../components/SavedViewsBar.jsx';
import { matrixToCohort } from '../lib/dashboard.js';
import { resultsCsvRows } from '../lib/exports.js';
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

const EMPTY = [];

// The same indented, tree-ordered group list the Evaluate and Groups pages use.
function orderGroups(groups) {
  const byParent = new Map();
  for (const group of groups) {
    const key = group.parentId ?? 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(group);
  }
  const walk = (parentKey, depth) =>
    (byParent.get(parentKey) ?? []).flatMap((group) => [
      { ...group, depth },
      ...walk(group.id, depth + 1),
    ]);
  return walk('root', 0);
}

// Compare every student in one group within one period. Scores are per group,
// so a group and a period must both be chosen before any table appears; the
// matrix for that pair feeds the same filter/sort/stats view the saved-view
// bar persists.
function ResultsPage() {
  const queryClient = useQueryClient();
  const periodsQuery = usePeriods();
  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: () => listGroups(),
  });

  const [config, setConfig] = useState(() => withFilterKeys(defaultConfig()));
  const [activeView, setActiveView] = useState(null);
  const [groupId, setGroupId] = useState('');
  const [periodId, setPeriodId] = useState('');

  const periods = periodsQuery.data ?? EMPTY;
  const groups = useMemo(
    () => orderGroups(groupsQuery.data ?? []),
    [groupsQuery.data]
  );

  const ready = groupId !== '' && periodId !== '';

  const matrixQuery = useQuery({
    queryKey: ['matrix', { groupId, periodId }],
    queryFn: () => getMatrix({ groupId, periodId }),
    enabled: ready,
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

  const cohort = useMemo(
    () => matrixToCohort(matrixQuery.data),
    [matrixQuery.data]
  );
  const parameters = cohort.parameters;
  const students = cohort.students;
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
      : parameters.filter((parameter) =>
          config.parameterIds.includes(parameter.id)
        );
  const columns = chosenColumns.length > 0 ? chosenColumns : parameters;
  const allIds = parameters.map((parameter) => parameter.id);
  const dirty = activeView !== null && !sameConfig(config, activeView.config);

  const selectedGroup = groups.find((group) => group.id === groupId) ?? null;
  const selectedPeriod =
    periods.find((period) => period.id === periodId) ?? null;
  const groupName = selectedGroup?.name ?? null;
  const periodName = selectedPeriod?.name ?? null;

  function patch(changes) {
    setConfig((existing) => ({ ...existing, ...changes }));
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
        <h1>Results</h1>
        <EmptyState
          tone="danger"
          title="Couldn't load results"
          description={(periodsQuery.error ?? groupsQuery.error).message}
        />
      </main>
    );
  }
  if (groups.length === 0) {
    return (
      <main>
        <h1>Results</h1>
        <EmptyState
          title="Create a group first"
          description="Scores are kept per group. Make a group and add students to it, then results will appear here."
        >
          <p>
            <Link className="btn" to="/groups">
              Go to Groups
            </Link>
          </p>
        </EmptyState>
      </main>
    );
  }
  if (periods.length === 0) {
    return (
      <main>
        <h1>Results</h1>
        <EmptyState
          title="Create a period first"
          description="Results are shown for a named period. Define one, then come back here."
        >
          <p>
            <Link className="btn" to="/periods">
              Go to Periods
            </Link>
          </p>
        </EmptyState>
      </main>
    );
  }

  const matrix = matrixQuery.data;
  const filterTexts = config.filters.map((filter) =>
    describeFilter(filter, parametersById)
  );

  return (
    <main className="wide results">
      <h1>Results</h1>
      <p className="hint">
        Compare the students in one group for one period. Filter, sort, and save
        the setup as a named view.
      </p>

      <div className="control-bar">
        <label className="group-filter">
          Group
          <select
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
          >
            <option value="">Choose a group…</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {'  '.repeat(group.depth)}
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <label className="group-filter">
          Period
          <select
            value={periodId}
            onChange={(event) => setPeriodId(event.target.value)}
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
        <EmptyState
          title="Choose a group and a period"
          description="Pick both above to compare the students in that group."
        />
      )}

      {ready && (
        <>
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
            <label className="search">
              <span className="sr-only">Search students</span>
              <input
                type="search"
                placeholder="Search by name or code…"
                value={config.search}
                onChange={(event) => patch({ search: event.target.value })}
              />
            </label>
            <ExportButton
              label="Export this table (CSV)"
              filename="results.csv"
              disabled={
                !matrix || parameters.length === 0 || view.rows.length === 0
              }
              buildRows={() =>
                resultsCsvRows({ groupName, periodName, columns, rows: view.rows })
              }
            />
          </div>

          <details className="columns-picker">
            <summary>Columns ({columns.length} shown)</summary>
            <div className="columns-grid">
              {parameters.length === 0 ? (
                <p className="hint">No parameters to choose from.</p>
              ) : (
                parameters.map((parameter) => {
                  const shown =
                    config.parameterIds.length === 0 ||
                    config.parameterIds.includes(parameter.id);
                  return (
                    <label key={parameter.id} className="column-toggle">
                      <input
                        type="checkbox"
                        checked={shown}
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
                  );
                })
              )}
            </div>
          </details>

          <section className="filters">
            <FilterEditor
              filters={config.filters}
              parameters={parameters}
              onChange={(filters) => patch({ filters })}
            />
          </section>

          {matrixQuery.isPending && (
            <p className="hint" role="status" aria-live="polite">
              Loading scores…
            </p>
          )}
          {matrixQuery.isError && (
            <EmptyState
              tone="danger"
              title="Couldn't load scores"
              description={matrixQuery.error.message}
            />
          )}

          {matrix && (
            <section className="section-card">
              <p className="results-summary">
                <strong>{groupName}</strong> · {periodName}
                {selectedPeriod && (
                  <>
                    {' '}
                    ({formatIsoDate(selectedPeriod.startDate)} –{' '}
                    {formatIsoDate(selectedPeriod.endDate)})
                  </>
                )}{' '}
                · Showing {view.rows.length} of {students.length} students
              </p>

              {filterTexts.length > 0 && (
                <ul className="filter-chips">
                  {filterTexts.map((text, index) => (
                    <li key={index} className="filter-chip">
                      {text}
                    </li>
                  ))}
                </ul>
              )}
              {view.ignoredFilters > 0 && (
                <p className="hint">
                  {view.ignoredFilters} filter
                  {view.ignoredFilters === 1 ? '' : 's'} ignored (parameter not
                  shown).
                </p>
              )}

              {parameters.length === 0 ? (
                <EmptyState
                  title="No parameters yet"
                  description="Define parameters, then scores for this group will appear here."
                />
              ) : view.rows.length === 0 ? (
                <EmptyState
                  title="No students match"
                  description="No students in this group match the current search and filters."
                >
                  <p>
                    <button type="button" className="btn" onClick={handleReset}>
                      Clear filters
                    </button>
                  </p>
                </EmptyState>
              ) : (
                <ResultsTable
                  rows={view.rows}
                  columns={columns}
                  stats={view.stats}
                  sort={config.sort}
                  onSort={(key) => patch({ sort: toggleSort(config.sort, key) })}
                />
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}

export default ResultsPage;
