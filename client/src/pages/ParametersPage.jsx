import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Drawer from '../components/Drawer.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { CloseIcon } from '../components/icons.jsx';
import {
  assignParameter,
  createParameter,
  getParameter,
  listParameters,
  unassignParameter,
  updateParameter,
} from '../api/parameters.js';
import { listGroups } from '../api/groups.js';
import { fetchAllStudents } from '../api/students.js';
import { numberToText, parseOptionalNumber } from '../lib/numbers.js';

// Parameters are the things you score — Speed, Rhythm, Posture — arranged in a
// tree of any depth. Only LEAF parameters are entered by hand; a parent's value
// is the average of its children and its effective range is the widest child
// span, both derived at read time. Each parameter also carries an optional norm
// (a single target or a target *range*), a unit, and any number of free-form
// "extra" details. Parameters are assigned to the groups and students they apply
// to; those assignments decide which parameters show up on the evaluate grid.

// Indent a tree row by its depth with the same em-dash prefix the pickers use.
function indentPrefix(depth) {
  return '— '.repeat(depth);
}

// The ids of a node and everything beneath it, read straight off the flat DFS
// forest: descendants are the run of deeper nodes immediately after it. Used to
// keep a parameter from being reparented under itself or its own child.
function selfAndDescendantIds(params, id) {
  const index = params.findIndex((p) => p.id === id);
  if (index === -1) return new Set([id]);
  const ids = new Set([id]);
  const baseDepth = params[index].depth;
  for (let i = index + 1; i < params.length && params[i].depth > baseDepth; i++) {
    ids.add(params[i].id);
  }
  return ids;
}

function extraToRows(extra) {
  if (!extra || typeof extra !== 'object') return [];
  return Object.entries(extra).map(([key, value]) => ({
    key,
    value: value == null ? '' : String(value),
  }));
}

function rowsToExtra(rows) {
  const extra = {};
  for (const { key, value } of rows) {
    const trimmed = key.trim();
    if (trimmed !== '') extra[trimmed] = value;
  }
  return extra;
}

function formatNorm({ normMin, normMax }) {
  if (normMin === null && normMax === null) return '—';
  if (normMin !== null && normMax !== null && normMin === normMax) {
    return String(normMin);
  }
  return `${normMin ?? '…'} – ${normMax ?? '…'}`;
}

function formatSpan({ minValue, maxValue }) {
  if (minValue === null && maxValue === null) return '—';
  return `${minValue ?? '…'} to ${maxValue ?? '…'}`;
}

// Shared numeric validation for the create and edit forms.
function parseNumericFields({ minText, maxText, normMinText, normMaxText }) {
  const min = parseOptionalNumber(minText);
  const max = parseOptionalNumber(maxText);
  const normMin = parseOptionalNumber(normMinText);
  const normMax = parseOptionalNumber(normMaxText);
  if (min.error || max.error || normMin.error || normMax.error) {
    return { error: 'Minimum, maximum and norm must be numbers, or left empty.' };
  }
  if (min.value !== null && max.value !== null && min.value > max.value) {
    return { error: 'The minimum cannot be larger than the maximum.' };
  }
  if (
    normMin.value !== null &&
    normMax.value !== null &&
    normMin.value > normMax.value
  ) {
    return { error: 'The norm start cannot be larger than the norm end.' };
  }
  return {
    values: {
      minValue: min.value,
      maxValue: max.value,
      normMin: normMin.value,
      normMax: normMax.value,
    },
  };
}

// A small repeating label→value editor for a parameter's free-form "extra"
// details. Empty-keyed rows are dropped on save, so a trailing blank row is a
// harmless "add another".
function ExtraFieldsEditor({ rows, onChange }) {
  function update(index, patch) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function remove(index) {
    onChange(rows.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...rows, { key: '', value: '' }]);
  }

  return (
    <div className="extra-editor">
      {rows.map((row, index) => (
        <div className="extra-row" key={index}>
          <input
            aria-label="Detail label"
            placeholder="Label (e.g. Source)"
            value={row.key}
            maxLength={60}
            onChange={(event) => update(index, { key: event.target.value })}
          />
          <input
            aria-label="Detail value"
            placeholder="Value"
            value={row.value}
            maxLength={200}
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <button
            type="button"
            className="chip-remove"
            aria-label="Remove detail"
            onClick={() => remove(index)}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="link-button" onClick={add}>
        + Add detail
      </button>
    </div>
  );
}

// The shared field block for both the create and edit forms. Everything is
// controlled by the parent so the two forms can own their own submit/mutation.
function ParameterFields({
  name,
  onName,
  parentId,
  onParentId,
  parentOptions,
  unit,
  onUnit,
  minText,
  onMinText,
  maxText,
  onMaxText,
  normMinText,
  onNormMinText,
  normMaxText,
  onNormMaxText,
  extraRows,
  onExtraRows,
}) {
  return (
    <>
      <div className="form-grid">
        <label>
          Name
          <input
            value={name}
            onChange={(event) => onName(event.target.value)}
            placeholder="e.g. Speed"
            maxLength={60}
            autoComplete="off"
          />
        </label>
        <label>
          Parent (optional)
          <select value={parentId} onChange={(event) => onParentId(event.target.value)}>
            <option value="">None — top level</option>
            {parentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {indentPrefix(option.depth)}
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Unit (optional)
          <input
            value={unit}
            onChange={(event) => onUnit(event.target.value)}
            placeholder="e.g. km/h"
            maxLength={20}
            autoComplete="off"
          />
        </label>
        <label>
          Minimum (optional)
          <input type="number" step="any" value={minText} onChange={(event) => onMinText(event.target.value)} />
        </label>
        <label>
          Maximum (optional)
          <input type="number" step="any" value={maxText} onChange={(event) => onMaxText(event.target.value)} />
        </label>
        <label>
          Norm start (optional)
          <input type="number" step="any" value={normMinText} onChange={(event) => onNormMinText(event.target.value)} />
        </label>
        <label>
          Norm end (optional)
          <input type="number" step="any" value={normMaxText} onChange={(event) => onNormMaxText(event.target.value)} />
        </label>
      </div>
      <label className="extra-label">
        Extra details (optional)
        <ExtraFieldsEditor rows={extraRows} onChange={onExtraRows} />
      </label>
    </>
  );
}

function CreateParameterForm({ parameters }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [unit, setUnit] = useState('');
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [normMinText, setNormMinText] = useState('');
  const [normMaxText, setNormMaxText] = useState('');
  const [extraRows, setExtraRows] = useState([]);
  const [problem, setProblem] = useState(null);

  const create = useMutation({
    mutationFn: createParameter,
    onSuccess: () => {
      setName('');
      setParentId('');
      setUnit('');
      setMinText('');
      setMaxText('');
      setNormMinText('');
      setNormMaxText('');
      setExtraRows([]);
      setProblem(null);
      queryClient.invalidateQueries({ queryKey: ['parameters'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    if (name.trim() === '') {
      setProblem('Please enter a name.');
      return;
    }
    const parsed = parseNumericFields({ minText, maxText, normMinText, normMaxText });
    if (parsed.error) {
      setProblem(parsed.error);
      return;
    }
    setProblem(null);
    create.mutate({
      name: name.trim(),
      parentId: parentId || undefined,
      unit: unit.trim() === '' ? undefined : unit.trim(),
      ...parsed.values,
      extra: rowsToExtra(extraRows),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <ParameterFields
        name={name}
        onName={setName}
        parentId={parentId}
        onParentId={setParentId}
        parentOptions={parameters}
        unit={unit}
        onUnit={setUnit}
        minText={minText}
        onMinText={setMinText}
        maxText={maxText}
        onMaxText={setMaxText}
        normMinText={normMinText}
        onNormMinText={setNormMinText}
        normMaxText={normMaxText}
        onNormMaxText={setNormMaxText}
        extraRows={extraRows}
        onExtraRows={setExtraRows}
      />
      <button type="submit" disabled={create.isPending || name.trim() === ''}>
        {create.isPending ? 'Adding…' : 'Add parameter'}
      </button>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {create.isError && (
        <p className="error" role="alert">
          {create.error.message}
        </p>
      )}
    </form>
  );
}

export default function ParametersPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [managedId, setManagedId] = useState(null);
  const query = useQuery({
    queryKey: ['parameters', { includeArchived }],
    queryFn: () => listParameters({ includeArchived }),
  });

  // The create form offers every non-archived parameter as a possible parent.
  const activeParameters = useMemo(
    () => (query.data ?? []).filter((p) => !p.archivedAt),
    [query.data],
  );

  return (
    <main className="wide">
      <h1>Parameters</h1>
      <p className="hint">
        A parameter is something you evaluate. Nest them to any depth — only the
        leaves are scored by hand, and each parent shows the average of its
        children and their widest range. Give a parameter a norm (one target or a
        range) to see it on the charts, and assign it to the groups and students
        it applies to.
      </p>

      <section className="section-card">
        <h2>Add a parameter</h2>
        <CreateParameterForm parameters={activeParameters} />
      </section>

      <section className="section-card">
        <div className="section-head">
          <h2>All parameters</h2>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
            />
            <span className="hint">Show archived</span>
          </label>
        </div>
        {query.isPending && <p className="hint">Loading…</p>}
        {query.isError && <p className="error">{query.error.message}</p>}
        {query.data && query.data.length === 0 && (
          <EmptyState
            title="No parameters yet"
            description="Add your first parameter above to start scoring."
          />
        )}
        {query.data && query.data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Range</th>
                  <th>Norm</th>
                  <th>Unit</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((parameter) => (
                  <ParameterTreeRow
                    key={parameter.id}
                    parameter={parameter}
                    onManage={() => setManagedId(parameter.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {managedId && (
        <ParameterDrawer
          parameterId={managedId}
          onClose={() => setManagedId(null)}
        />
      )}
    </main>
  );
}

function ParameterTreeRow({ parameter, onManage }) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['parameters'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
  };
  const setArchived = useMutation({
    mutationFn: (archived) => updateParameter(parameter.id, { archived }),
    onSuccess: invalidate,
  });
  const archived = Boolean(parameter.archivedAt);

  return (
    <tr className={archived ? 'is-archived' : undefined}>
      <td>
        <span className="tree-indent" aria-hidden="true">
          {indentPrefix(parameter.depth)}
        </span>
        {parameter.name}
        <span className={`chip ${parameter.isLeaf ? '' : 'brand'}`.trim()}>
          {parameter.isLeaf ? 'leaf' : 'parent'}
        </span>
      </td>
      <td>{formatSpan(parameter.effective)}</td>
      <td>{formatNorm(parameter.effective)}</td>
      <td>{parameter.unit ?? '—'}</td>
      <td className="actions">
        <button type="button" onClick={onManage}>
          Manage
        </button>
        <button
          type="button"
          onClick={() => setArchived.mutate(!archived)}
          disabled={setArchived.isPending}
        >
          {archived ? 'Restore' : 'Archive'}
        </button>
      </td>
    </tr>
  );
}

function ParameterDrawer({ parameterId, onClose }) {
  const titleId = 'parameter-drawer-title';
  const query = useQuery({
    queryKey: ['parameter', parameterId],
    queryFn: () => getParameter(parameterId),
  });
  // The parent picker needs the whole forest (including archived, so a parameter
  // parented under an archived node still shows its parent).
  const forestQuery = useQuery({
    queryKey: ['parameters', { includeArchived: true }],
    queryFn: () => listParameters({ includeArchived: true }),
  });
  const parameter = query.data;

  return (
    <Drawer open titleId={titleId} onClose={onClose}>
      <header className="drawer-head">
        <h2 id={titleId} className="drawer-title">
          {parameter ? parameter.name : 'Parameter'}
        </h2>
        <button
          type="button"
          className="drawer-close"
          onClick={onClose}
          aria-label="Close"
        >
          <CloseIcon size={18} />
        </button>
      </header>
      {query.isPending && <p className="hint">Loading…</p>}
      {query.isError && <p className="error">{query.error.message}</p>}
      {parameter && (
        <>
          <ParameterEditForm
            parameter={parameter}
            parameters={forestQuery.data ?? []}
          />
          <ParameterAssignments parameter={parameter} />
        </>
      )}
    </Drawer>
  );
}

function ParameterEditForm({ parameter, parameters }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(parameter.name);
  const [parentId, setParentId] = useState(parameter.parentId ?? '');
  const [unit, setUnit] = useState(parameter.unit ?? '');
  const [minText, setMinText] = useState(numberToText(parameter.minValue));
  const [maxText, setMaxText] = useState(numberToText(parameter.maxValue));
  const [normMinText, setNormMinText] = useState(numberToText(parameter.normMin));
  const [normMaxText, setNormMaxText] = useState(numberToText(parameter.normMax));
  const [extraRows, setExtraRows] = useState(extraToRows(parameter.extra));
  const [problem, setProblem] = useState(null);

  // A parameter cannot become its own parent or a child of its own descendants.
  const forbidden = useMemo(
    () => selfAndDescendantIds(parameters, parameter.id),
    [parameters, parameter.id],
  );
  const parentOptions = parameters.filter(
    (p) => !forbidden.has(p.id) && !p.archivedAt,
  );

  const save = useMutation({
    mutationFn: (fields) => updateParameter(parameter.id, fields),
    onSuccess: () => {
      setProblem(null);
      queryClient.invalidateQueries({ queryKey: ['parameter', parameter.id] });
      queryClient.invalidateQueries({ queryKey: ['parameters'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    if (name.trim() === '') {
      setProblem('Please enter a name.');
      return;
    }
    const parsed = parseNumericFields({ minText, maxText, normMinText, normMaxText });
    if (parsed.error) {
      setProblem(parsed.error);
      return;
    }
    setProblem(null);
    save.mutate({
      name: name.trim(),
      parentId: parentId || null,
      unit: unit.trim() === '' ? null : unit.trim(),
      ...parsed.values,
      extra: rowsToExtra(extraRows),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <ParameterFields
        name={name}
        onName={setName}
        parentId={parentId}
        onParentId={setParentId}
        parentOptions={parentOptions}
        unit={unit}
        onUnit={setUnit}
        minText={minText}
        onMinText={setMinText}
        maxText={maxText}
        onMaxText={setMaxText}
        normMinText={normMinText}
        onNormMinText={setNormMinText}
        normMaxText={normMaxText}
        onNormMaxText={setNormMaxText}
        extraRows={extraRows}
        onExtraRows={setExtraRows}
      />
      <button type="submit" disabled={save.isPending || name.trim() === ''}>
        {save.isPending ? 'Saving…' : 'Save changes'}
      </button>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {save.isError && (
        <p className="error" role="alert">
          {save.error.message}
        </p>
      )}
    </form>
  );
}

function assignmentLabel(assignment) {
  if (assignment.studentId) {
    return assignment.studentCode
      ? `${assignment.studentName} (${assignment.studentCode})`
      : assignment.studentName;
  }
  return assignment.groupName ?? 'Group';
}

function ParameterAssignments({ parameter }) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState('');

  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: () => listGroups() });
  const studentsQuery = useQuery({
    queryKey: ['all-students'],
    queryFn: fetchAllStudents,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['parameter', parameter.id] });
    queryClient.invalidateQueries({ queryKey: ['parameters'] });
  };

  const assign = useMutation({
    mutationFn: (value) => {
      const [kind, id] = value.split(':');
      return assignParameter(
        parameter.id,
        kind === 'g' ? { groupId: id } : { studentId: id },
      );
    },
    onSuccess: () => {
      setTarget('');
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (assignmentId) => unassignParameter(parameter.id, assignmentId),
    onSuccess: invalidate,
  });

  const assignments = parameter.assignments ?? [];
  // Already-assigned ids, so the picker never offers a duplicate.
  const takenGroups = new Set(assignments.filter((a) => a.groupId).map((a) => a.groupId));
  const takenStudents = new Set(
    assignments.filter((a) => a.studentId).map((a) => a.studentId),
  );
  const groups = (groupsQuery.data ?? []).filter((g) => !takenGroups.has(g.id));
  const students = (studentsQuery.data ?? []).filter((s) => !takenStudents.has(s.id));

  return (
    <section className="drawer-section">
      <h3>Assigned to</h3>
      <p className="hint">
        A parameter is scored only for the groups and students it is assigned to.
      </p>
      {assignments.length === 0 && <p className="hint">Not assigned yet.</p>}
      {assignments.length > 0 && (
        <ul className="chip-list">
          {assignments.map((assignment) => (
            <li key={assignment.id} className="chip">
              <span>{assignmentLabel(assignment)}</span>
              <button
                type="button"
                className="chip-remove"
                aria-label={`Remove ${assignmentLabel(assignment)}`}
                onClick={() => remove.mutate(assignment.id)}
                disabled={remove.isPending}
              >
                <CloseIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (target) assign.mutate(target);
        }}
      >
        <label>
          Add an assignment
          <select value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="">Choose a group or student…</option>
            {groups.length > 0 && (
              <optgroup label="Groups">
                {groups.map((group) => (
                  <option key={group.id} value={`g:${group.id}`}>
                    {group.name}
                  </option>
                ))}
              </optgroup>
            )}
            {students.length > 0 && (
              <optgroup label="Students">
                {students.map((student) => (
                  <option key={student.id} value={`s:${student.id}`}>
                    {student.fullName}
                    {student.studentCode ? ` (${student.studentCode})` : ''}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <button type="submit" disabled={assign.isPending || target === ''}>
          {assign.isPending ? 'Adding…' : 'Add'}
        </button>
        {(assign.isError || remove.isError) && (
          <p className="error" role="alert">
            {(assign.error ?? remove.error).message}
          </p>
        )}
      </form>
    </section>
  );
}
