import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Drawer from '../components/Drawer.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { usePeriods } from '../lib/usePeriods.js';
import {
  assignPeriod,
  createPeriod,
  getPeriod,
  unassignPeriod,
  updatePeriod,
} from '../api/periods.js';
import { listGroups } from '../api/groups.js';
import { fetchAllStudents } from '../api/students.js';
import { CloseIcon } from '../components/icons.jsx';

// Periods are named, dated windows (from -> to) that scores and tasks hang off.
// They are designed here, then assigned to the groups and/or students they
// apply to. A period is "anchored until changed": once set it stays put, so the
// history always knows which score belongs to which period. Nothing here forgets
// those links — archiving a period keeps its rows; it just hides it from the
// pickers.

function formatRange(startDate, endDate) {
  if (!startDate && !endDate) return '—';
  return `${startDate ?? '…'} → ${endDate ?? '…'}`;
}

function CreatePeriodForm() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const create = useMutation({
    mutationFn: createPeriod,
    onSuccess: () => {
      setName('');
      setStartDate('');
      setEndDate('');
      queryClient.invalidateQueries({ queryKey: ['periods'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    create.mutate({ name: name.trim(), startDate, endDate });
  }

  const ready = name.trim() !== '' && startDate !== '' && endDate !== '';

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <label>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            autoComplete="off"
            placeholder="e.g. Autumn term 2026"
          />
        </label>
        <label>
          From
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
      </div>
      <button type="submit" disabled={create.isPending || !ready}>
        {create.isPending ? 'Adding…' : 'Add period'}
      </button>
      {create.isError && (
        <p className="error" role="alert">
          {create.error.message}
        </p>
      )}
    </form>
  );
}

export default function PeriodsPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [managedId, setManagedId] = useState(null);
  const query = usePeriods({ includeArchived });

  return (
    <main className="wide">
      <h1>Periods</h1>
      <p className="hint">
        Name the windows you score against, then assign each to the groups and
        students it covers. A period stays anchored once set, so every score
        keeps its place in the history.
      </p>

      <section className="section-card">
        <h2>Create a period</h2>
        <CreatePeriodForm />
      </section>

      <section className="section-card">
        <div className="section-head">
          <h2>Periods</h2>
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
            title="No periods yet"
            description="Create your first period above to start scoring."
          />
        )}
        {query.data && query.data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Dates</th>
                  <th>Assignments</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((period) => (
                  <PeriodRow
                    key={period.id}
                    period={period}
                    onManage={() => setManagedId(period.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {managedId && (
        <PeriodDrawer periodId={managedId} onClose={() => setManagedId(null)} />
      )}
    </main>
  );
}

function PeriodRow({ period, onManage }) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['periods'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
  };
  const setArchived = useMutation({
    mutationFn: (archived) => updatePeriod(period.id, { archived }),
    onSuccess: invalidate,
  });
  const archived = Boolean(period.archivedAt);

  return (
    <tr className={archived ? 'is-archived' : undefined}>
      <td>{period.name}</td>
      <td>{formatRange(period.startDate, period.endDate)}</td>
      <td>{period.assignmentCount ?? 0}</td>
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
        {setArchived.isError && (
          <p className="error" role="alert">
            {setArchived.error.message}
          </p>
        )}
      </td>
    </tr>
  );
}

function PeriodDrawer({ periodId, onClose }) {
  const titleId = 'period-drawer-title';
  const query = useQuery({
    queryKey: ['period', periodId],
    queryFn: () => getPeriod(periodId),
  });
  const period = query.data;

  return (
    <Drawer open titleId={titleId} onClose={onClose}>
      <header className="drawer-head">
        <h2 id={titleId} className="drawer-title">
          {period ? period.name : 'Period'}
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
      {period && (
        <>
          <PeriodEditForm period={period} />
          <PeriodAssignments period={period} />
        </>
      )}
    </Drawer>
  );
}

function PeriodEditForm({ period }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(period.name);
  const [startDate, setStartDate] = useState(period.startDate ?? '');
  const [endDate, setEndDate] = useState(period.endDate ?? '');

  const save = useMutation({
    mutationFn: () =>
      updatePeriod(period.id, { name: name.trim(), startDate, endDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['period', period.id] });
      queryClient.invalidateQueries({ queryKey: ['periods'] });
    },
  });

  const dirty =
    name.trim() !== period.name ||
    startDate !== (period.startDate ?? '') ||
    endDate !== (period.endDate ?? '');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="form-grid">
        <label>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            autoComplete="off"
          />
        </label>
        <label>
          From
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
      </div>
      <button type="submit" disabled={save.isPending || !dirty || name.trim() === ''}>
        {save.isPending ? 'Saving…' : 'Save changes'}
      </button>
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

function PeriodAssignments({ period }) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState('');

  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: () => listGroups() });
  const studentsQuery = useQuery({
    queryKey: ['all-students'],
    queryFn: fetchAllStudents,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['period', period.id] });
    queryClient.invalidateQueries({ queryKey: ['periods'] });
  };

  const assign = useMutation({
    mutationFn: (value) => {
      const [kind, id] = value.split(':');
      return assignPeriod(period.id, kind === 'g' ? { groupId: id } : { studentId: id });
    },
    onSuccess: () => {
      setTarget('');
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (assignmentId) => unassignPeriod(period.id, assignmentId),
    onSuccess: invalidate,
  });

  const assignments = period.assignments ?? [];
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


