import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Drawer from '../components/Drawer.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { CloseIcon } from '../components/icons.jsx';
import { usePeriods } from '../lib/usePeriods.js';
import {
  archiveTask,
  assignTask,
  createTask,
  getTask,
  listTasks,
  setTaskCompletion,
  unassignTask,
  updateTask,
} from '../api/tasks.js';
import { listParameters } from '../api/parameters.js';
import { listGroups } from '../api/groups.js';
import { fetchAllStudents } from '../api/students.js';

// Tasks are open-ended work items — not scores. Each can optionally point at a
// parameter, and is assigned to a group or a student (optionally within one
// period). Every assignment carries a completion checkbox; what, if anything,
// that does to evaluation is a decision left for later, so this page just
// records the state faithfully.

function CreateTaskForm({ parameters }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [parameterId, setParameterId] = useState('');

  const create = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      setTitle('');
      setDescription('');
      setParameterId('');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    create.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      parameterId: parameterId || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <label>
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            autoComplete="off"
          />
        </label>
        <label>
          Linked parameter (optional)
          <select
            value={parameterId}
            onChange={(event) => setParameterId(event.target.value)}
          >
            <option value="">None</option>
            {parameters.map((parameter) => (
              <option key={parameter.id} value={parameter.id}>
                {'— '.repeat(parameter.depth)}
                {parameter.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Description (optional)
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          maxLength={2000}
        />
      </label>
      <button type="submit" disabled={create.isPending || title.trim() === ''}>
        {create.isPending ? 'Adding…' : 'Add task'}
      </button>
      {create.isError && (
        <p className="error" role="alert">
          {create.error.message}
        </p>
      )}
    </form>
  );
}

export default function TasksPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [managedId, setManagedId] = useState(null);
  const tasksQuery = useQuery({
    queryKey: ['tasks', { includeArchived }],
    queryFn: () => listTasks({ includeArchived }),
  });
  const parametersQuery = useQuery({
    queryKey: ['parameters'],
    queryFn: () => listParameters(),
  });
  const parameters = parametersQuery.data ?? [];

  return (
    <main className="wide">
      <h1>Tasks</h1>
      <p className="hint">
        Open-ended work items you can hang off a group or a student, optionally
        within a period. Tick an assignment off when it is done — the completion
        is recorded, nothing more.
      </p>

      <section className="section-card">
        <h2>Create a task</h2>
        <CreateTaskForm parameters={parameters} />
      </section>

      <section className="section-card">
        <div className="section-head">
          <h2>Tasks</h2>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
            />
            <span className="hint">Show archived</span>
          </label>
        </div>
        {tasksQuery.isPending && <p className="hint">Loading…</p>}
        {tasksQuery.isError && <p className="error">{tasksQuery.error.message}</p>}
        {tasksQuery.data && tasksQuery.data.length === 0 && (
          <EmptyState
            title="No tasks yet"
            description="Create your first task above."
          />
        )}
        {tasksQuery.data && tasksQuery.data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Progress</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasksQuery.data.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onManage={() => setManagedId(task.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {managedId && (
        <TaskDrawer taskId={managedId} onClose={() => setManagedId(null)} />
      )}
    </main>
  );
}

function TaskRow({ task, onManage }) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
  };
  const setArchived = useMutation({
    mutationFn: (archived) => updateTask(task.id, { archived }),
    onSuccess: invalidate,
  });
  const archived = Boolean(task.archivedAt);

  return (
    <tr className={archived ? 'is-archived' : undefined}>
      <td>{task.title}</td>
      <td>
        {task.assignmentCount === 0
          ? '—'
          : `${task.doneCount}/${task.assignmentCount} done`}
      </td>
      <td className="actions">
        <button type="button" onClick={onManage}>
          Manage
        </button>
        <button
          type="button"
          onClick={() => {
            if (archived) {
              setArchived.mutate(false);
            } else {
              archiveTask(task.id).then(invalidate);
            }
          }}
          disabled={setArchived.isPending}
        >
          {archived ? 'Restore' : 'Archive'}
        </button>
      </td>
    </tr>
  );
}

function TaskDrawer({ taskId, onClose }) {
  const titleId = 'task-drawer-title';
  const query = useQuery({ queryKey: ['task', taskId], queryFn: () => getTask(taskId) });
  const parametersQuery = useQuery({
    queryKey: ['parameters'],
    queryFn: () => listParameters(),
  });
  const task = query.data;

  return (
    <Drawer open titleId={titleId} onClose={onClose}>
      <header className="drawer-head">
        <h2 id={titleId} className="drawer-title">
          {task ? task.title : 'Task'}
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
      {task && (
        <>
          <TaskEditForm task={task} parameters={parametersQuery.data ?? []} />
          <TaskAssignments task={task} />
        </>
      )}
    </Drawer>
  );
}

function TaskEditForm({ task, parameters }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [parameterId, setParameterId] = useState(task.parameterId ?? '');

  const save = useMutation({
    mutationFn: () =>
      updateTask(task.id, {
        title: title.trim(),
        description: description.trim(),
        parameterId: parameterId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', task.id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const dirty =
    title.trim() !== task.title ||
    description.trim() !== (task.description ?? '') ||
    (parameterId || '') !== (task.parameterId ?? '');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label>
        Title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          autoComplete="off"
        />
      </label>
      <label>
        Linked parameter (optional)
        <select
          value={parameterId}
          onChange={(event) => setParameterId(event.target.value)}
        >
          <option value="">None</option>
          {parameters.map((parameter) => (
            <option key={parameter.id} value={parameter.id}>
              {'— '.repeat(parameter.depth)}
              {parameter.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Description (optional)
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          maxLength={2000}
        />
      </label>
      <button type="submit" disabled={save.isPending || !dirty || title.trim() === ''}>
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

function assignmentTarget(assignment) {
  if (assignment.studentId) {
    return assignment.studentCode
      ? `${assignment.studentName} (${assignment.studentCode})`
      : assignment.studentName;
  }
  return assignment.groupName ?? 'Group';
}

function TaskAssignments({ task }) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState('');
  const [periodId, setPeriodId] = useState('');

  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: () => listGroups() });
  const studentsQuery = useQuery({
    queryKey: ['all-students'],
    queryFn: fetchAllStudents,
  });
  const periodsQuery = usePeriods();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['task', task.id] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const assign = useMutation({
    mutationFn: () => {
      const [kind, id] = target.split(':');
      return assignTask(task.id, {
        ...(kind === 'g' ? { groupId: id } : { studentId: id }),
        ...(periodId ? { periodId } : {}),
      });
    },
    onSuccess: () => {
      setTarget('');
      setPeriodId('');
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (assignmentId) => unassignTask(task.id, assignmentId),
    onSuccess: invalidate,
  });
  const toggle = useMutation({
    mutationFn: ({ assignmentId, done }) =>
      setTaskCompletion(task.id, { assignmentId, done }),
    onSuccess: invalidate,
  });

  const assignments = task.assignments ?? [];
  const groups = groupsQuery.data ?? [];
  const students = studentsQuery.data ?? [];
  const periods = periodsQuery.data ?? [];

  return (
    <section className="drawer-section">
      <h3>Assignments</h3>
      {assignments.length === 0 && <p className="hint">Not assigned yet.</p>}
      {assignments.length > 0 && (
        <ul className="assignment-list">
          {assignments.map((assignment) => (
            <li key={assignment.id} className="assignment-row">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={assignment.done}
                  onChange={(event) =>
                    toggle.mutate({
                      assignmentId: assignment.id,
                      done: event.target.checked,
                    })
                  }
                  disabled={toggle.isPending}
                />
                <span>
                  {assignmentTarget(assignment)}
                  {assignment.periodName && (
                    <span className="hint"> · {assignment.periodName}</span>
                  )}
                </span>
              </label>
              <button
                type="button"
                className="chip-remove"
                aria-label={`Remove ${assignmentTarget(assignment)}`}
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
          if (target) assign.mutate();
        }}
      >
        <div className="form-grid">
          <label>
            Assign to
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
          <label>
            Period (optional)
            <select value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
              <option value="">Any</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" disabled={assign.isPending || target === ''}>
          {assign.isPending ? 'Adding…' : 'Add assignment'}
        </button>
        {(assign.isError || remove.isError || toggle.isError) && (
          <p className="error" role="alert">
            {(assign.error ?? remove.error ?? toggle.error).message}
          </p>
        )}
      </form>
    </section>
  );
}


