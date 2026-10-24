import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  generateSessions,
  listSessions,
  updateSession,
} from '../api/sessions.js';
import {
  assignTaskTemplate,
  archiveTaskTemplate,
  createTask,
  createTaskTemplate,
  deleteTask,
  listSessionTasks,
  listTaskTemplates,
  updateTask,
  updateTaskTemplate,
} from '../api/tasks.js';
import { listTeachers } from '../api/teachers.js';
import { useAuth } from '../auth/AuthContext.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { formatIsoDate, toIsoDate } from '../lib/format.js';

// The generated occurrences of the schedule: each row is one planned session
// (anchor + n * interval) that can be moved, canceled or annotated. The
// planned date itself never changes, so the schedule stays stable.

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function SessionEditRow({ session, onDone }) {
  const queryClient = useQueryClient();
  const [movedTo, setMovedTo] = useState(session.movedTo ?? '');
  const [canceled, setCanceled] = useState(session.canceledAt !== null);
  const [note, setNote] = useState(session.note ?? '');

  const save = useMutation({
    mutationFn: () =>
      updateSession(session.id, {
        movedTo: movedTo === '' ? null : movedTo,
        canceled,
        note,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      onDone();
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="edit-form">
      <label htmlFor={`moved-${session.id}`}>Takes place on</label>
      <input
        id={`moved-${session.id}`}
        type="date"
        value={movedTo}
        onChange={(event) => setMovedTo(event.target.value)}
        disabled={save.isPending}
      />
      <p className="hint">Leave empty to keep the planned date ({formatIsoDate(session.plannedDate)}).</p>

      <label className="hint">
        <input
          type="checkbox"
          checked={canceled}
          onChange={(event) => setCanceled(event.target.checked)}
          disabled={save.isPending}
        />{' '}
        Canceled
      </label>

      <label htmlFor={`note-${session.id}`}>Note</label>
      <textarea
        id={`note-${session.id}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        rows={2}
        disabled={save.isPending}
      />

      <div className="row">
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving...' : 'Save session'}
        </button>
        <button type="button" onClick={onDone} disabled={save.isPending}>
          Cancel
        </button>
      </div>
      {save.isError && <p className="error">{save.error.message}</p>}
    </form>
  );
}

function SessionTasksPanel({ session, templates }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState('');

  const tasksQuery = useQuery({
    queryKey: ['session-tasks', session.id],
    queryFn: () => listSessionTasks(session.id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['session-tasks', session.id] });
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
  };
  const add = useMutation({
    mutationFn: () => createTask({ sessionId: session.id, title, description }),
    onSuccess: () => {
      invalidate();
      setTitle('');
      setDescription('');
    },
  });
  const toggle = useMutation({
    mutationFn: (task) => updateTask(task.id, { done: !task.done }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (task) => deleteTask(task.id),
    onSuccess: invalidate,
  });
  const fromTemplate = useMutation({
    mutationFn: () =>
      assignTaskTemplate({ templateId, sessionIds: [session.id] }),
    onSuccess: invalidate,
  });

  function handleAdd(event) {
    event.preventDefault();
    if (title.trim() !== '') add.mutate();
  }

  const busy =
    add.isPending || toggle.isPending || remove.isPending || fromTemplate.isPending;
  const tasks = tasksQuery.data ?? [];

  return (
    <div>
      <h3>Tasks for {formatIsoDate(session.sessionDate)} ({session.code})</h3>
      {tasksQuery.isPending && <p className="hint">Loading…</p>}
      {tasksQuery.isError && (
        <p className="error" role="alert">{tasksQuery.error.message}</p>
      )}
      {tasks.length === 0 && !tasksQuery.isPending && (
        <p className="hint">No tasks yet for this session.</p>
      )}
      {tasks.length > 0 && (
        <ul className="plain-list">
          {tasks.map((task) => (
            <li key={task.id}>
              <label>
                <input
                  type="checkbox"
                  checked={task.done}
                  disabled={busy}
                  onChange={() => toggle.mutate(task)}
                />{' '}
                <span className={task.done ? 'hint' : undefined}>
                  {task.title}
                </span>
              </label>
              {task.description && (
                <p className="hint">{task.description}</p>
              )}
              <button
                type="button"
                className="quiet"
                onClick={() => remove.mutate(task)}
                disabled={busy}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="edit-form">
        <label htmlFor={`task-title-${session.id}`}>New task</label>
        <input
          id={`task-title-${session.id}`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          placeholder="e.g. Homework check"
          autoComplete="off"
          disabled={add.isPending}
        />
        <label htmlFor={`task-desc-${session.id}`}>Description (optional)</label>
        <textarea
          id={`task-desc-${session.id}`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={2000}
          rows={2}
          disabled={add.isPending}
        />
        <button type="submit" disabled={add.isPending || title.trim() === ''}>
          {add.isPending ? 'Adding...' : 'Add task'}
        </button>
        {(add.isError || remove.isError || toggle.isError) && (
          <p className="error" role="alert">
            {(add.error ?? remove.error ?? toggle.error)?.message}
          </p>
        )}
      </form>

      {templates.length > 0 && (
        <div className="row">
          <select
            aria-label="Add from a template"
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            disabled={fromTemplate.isPending}
          >
            <option value="">From a template…</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => fromTemplate.mutate()}
            disabled={fromTemplate.isPending || templateId === ''}
          >
            {fromTemplate.isPending ? 'Adding...' : 'Add from template'}
          </button>
          {fromTemplate.isError && (
            <p className="error" role="alert">{fromTemplate.error.message}</p>
          )}
        </div>
      )}
    </div>
  );
}

function TaskTemplatesManager({ templates }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['task-templates'] });
  const add = useMutation({
    mutationFn: () => createTaskTemplate({ title, description }),
    onSuccess: () => {
      invalidate();
      setTitle('');
      setDescription('');
    },
  });
  const archive = useMutation({
    mutationFn: (id) => archiveTaskTemplate(id),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: (id) => updateTaskTemplate(id, { archived: false }),
    onSuccess: invalidate,
  });

  function handleSubmit(event) {
    event.preventDefault();
    if (title.trim() !== '') add.mutate();
  }

  return (
    <section className="section-card">
      <h2>Task templates</h2>
      {templates.length === 0 && (
        <p className="hint">
          No templates yet — add one below, then attach it to any session.
        </p>
      )}
      {templates.length > 0 && (
        <table>
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Description</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr
                key={template.id}
                className={template.archivedAt ? 'stale' : undefined}
              >
                <th scope="row">{template.title}</th>
                <td>{template.description ?? '—'}</td>
                <td>
                  {template.archivedAt ? (
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => restore.mutate(template.id)}
                      disabled={archive.isPending || restore.isPending}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => archive.mutate(template.id)}
                      disabled={archive.isPending || restore.isPending}
                    >
                      Archive
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={handleSubmit} className="edit-form">
        <label htmlFor="template-title">New template</label>
        <input
          id="template-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          placeholder="e.g. Weekly quiz"
          autoComplete="off"
          disabled={add.isPending}
        />
        <label htmlFor="template-desc">Description (optional)</label>
        <textarea
          id="template-desc"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={2000}
          rows={2}
          disabled={add.isPending}
        />
        <button type="submit" disabled={add.isPending || title.trim() === ''}>
          {add.isPending ? 'Adding...' : 'Add template'}
        </button>
        {add.isError && <p className="error">{add.error.message}</p>}
      </form>
    </section>
  );
}

function SessionsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const today = new Date();

  const [from, setFrom] = useState(toIsoDate(addDays(today, -7)));
  const [to, setTo] = useState(toIsoDate(addDays(today, 30)));
  const [teacherId, setTeacherId] = useState('');
  const [includeCanceled, setIncludeCanceled] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [tasksForId, setTasksForId] = useState(null);

  const [generateUntil, setGenerateUntil] = useState(toIsoDate(addDays(today, 60)));
  const canManage = can('schedule.manage');
  const canPickTeachers = can('teachers.view');

  const sessionsQuery = useQuery({
    queryKey: [
      'sessions',
      { from, to, teacherId, includeCanceled, includeArchived },
    ],
    queryFn: () =>
      listSessions({
        from,
        to,
        teacherId: teacherId || null,
        includeCanceled,
        includeArchived,
      }),
  });

  const teachersQuery = useQuery({
    queryKey: ['teachers', { search: '', includeArchived: false }],
    queryFn: () => listTeachers({}),
    enabled: canPickTeachers,
  });
  const templatesQuery = useQuery({
    queryKey: ['task-templates', { includeArchived: true }],
    queryFn: () => listTaskTemplates({ includeArchived: true }),
    enabled: canManage,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['sessions'] });

  const generate = useMutation({
    mutationFn: () => generateSessions({ until: generateUntil }),
    onSuccess: invalidate,
  });
  const quickCancel = useMutation({
    mutationFn: ({ session, canceled }) =>
      updateSession(session.id, { canceled }),
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: (session) => updateSession(session.id, { archived: true }),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: (session) => updateSession(session.id, { archived: false }),
    onSuccess: invalidate,
  });
  const busy =
    quickCancel.isPending || archive.isPending || restore.isPending;

  const sessions = sessionsQuery.data?.sessions ?? [];

  return (
    <main className="wide">
      <div className="page-head">
        <div>
          <h1>Sessions</h1>
          <p className="hint">
            The generated occurrences of the schedule: move, cancel or annotate
            them as reality shifts.
          </p>
        </div>
      </div>

      {canManage && (
        <section className="section-card">
          <h2>Generate sessions</h2>
          <div className="row">
            <label htmlFor="generate-until">Create planned sessions until</label>
            <input
              id="generate-until"
              type="date"
              value={generateUntil}
              onChange={(event) => setGenerateUntil(event.target.value)}
            />
            <button
              type="button"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
            >
              {generate.isPending ? 'Generating...' : 'Generate'}
            </button>
          </div>
          {generate.isError && (
            <p className="error" role="alert">
              {generate.error.message}
            </p>
          )}
          {generate.isSuccess && (
            <p className="success" role="status">
              {generate.data.created === 0
                ? 'Everything in that range already exists.'
                : `Created ${generate.data.created} session${
                    generate.data.created === 1 ? '' : 's'
                  }.`}
            </p>
          )}
        </section>
      )}

      <section className="section-card">
        <div className="toolbar">
          <label htmlFor="sessions-from">From</label>
          <input
            id="sessions-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <label htmlFor="sessions-to">To</label>
          <input
            id="sessions-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
          {canPickTeachers && (
            <select
              aria-label="Filter by teacher"
              value={teacherId}
              onChange={(event) => setTeacherId(event.target.value)}
            >
              <option value="">All teachers</option>
              {(teachersQuery.data ?? []).map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.fullName}
                </option>
              ))}
            </select>
          )}
          <label className="hint">
            <input
              type="checkbox"
              checked={includeCanceled}
              onChange={(event) => setIncludeCanceled(event.target.checked)}
            />
            Canceled
          </label>
          <label className="hint">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
            />
            Archived
          </label>
        </div>

        {sessionsQuery.isPending && <p className="hint">Loading…</p>}
        {sessionsQuery.isError && (
          <p className="error" role="alert">
            {sessionsQuery.error.message}
          </p>
        )}
        {sessionsQuery.data?.truncated && (
          <p className="hint">
            Showing the first 500 sessions; narrow the date range to see more.
          </p>
        )}
        {sessions.length === 0 && !sessionsQuery.isPending && (
          <EmptyState
            title="No sessions in this range"
            description={
              canManage
                ? 'Generate the planned sessions with the button above.'
                : 'Ask an administrator to generate the schedule.'
            }
          />
        )}

        {sessions.length > 0 && (
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Code</th>
                <th scope="col">Teacher</th>
                <th scope="col">Target</th>
                <th scope="col">Period</th>
                <th scope="col">Note</th>
                {canManage && <th scope="col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const target = session.groupId
                  ? `Group ${session.groupName}`
                  : session.studentName ?? '—';
                if (editingId === session.id) {
                  return (
                    <tr key={session.id}>
                      <td colSpan={canManage ? 7 : 6}>
                        <SessionEditRow
                          session={session}
                          onDone={() => setEditingId(null)}
                        />
                      </td>
                    </tr>
                  );
                }
                const rows = [
                  <tr
                    key={session.id}
                    className={
                      session.canceledAt || session.archivedAt
                        ? 'stale'
                        : undefined
                    }
                  >
                    <td>
                      {formatIsoDate(session.sessionDate)}
                      {session.movedTo && (
                        <span className="hint">
                          {' '}
                          (moved from {formatIsoDate(session.plannedDate)})
                        </span>
                      )}
                      {session.canceledAt && <span className="hint"> — canceled</span>}
                    </td>
                    <td>
                      <code>{session.code}</code>
                    </td>
                    <td>{session.teacherName}</td>
                    <td>{target}</td>
                    <td>
                      {session.periodNumber ? `№ ${session.periodNumber}` : '—'}
                    </td>
                    <td>{session.note ?? '—'}</td>
                    {canManage && (
                      <td>
                        <button
                          type="button"
                          className="quiet"
                          onClick={() =>
                            setTasksForId(tasksForId === session.id ? null : session.id)
                          }
                        >
                          Tasks ({session.taskCount})
                        </button>{' '}
                        <button
                          type="button"
                          className="quiet"
                          onClick={() => setEditingId(session.id)}
                          disabled={busy}
                        >
                          Edit
                        </button>{' '}
                        {session.canceledAt ? (
                          <button
                            type="button"
                            className="quiet"
                            onClick={() =>
                              quickCancel.mutate({ session, canceled: false })
                            }
                            disabled={busy}
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="quiet"
                            onClick={() =>
                              quickCancel.mutate({ session, canceled: true })
                            }
                            disabled={busy}
                          >
                            Cancel
                          </button>
                        )}{' '}
                        {session.archivedAt ? (
                          <button
                            type="button"
                            className="quiet"
                            onClick={() => restore.mutate(session)}
                            disabled={busy}
                          >
                            Unarchive
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="quiet"
                            onClick={() => archive.mutate(session)}
                            disabled={busy}
                          >
                            Archive
                          </button>
                        )}
                      </td>
                    )}
                  </tr>,
                ];
                if (tasksForId === session.id) {
                  rows.push(
                    <tr key={`${session.id}-tasks`}>
                      <td colSpan={canManage ? 7 : 6}>
                        <SessionTasksPanel
                          session={session}
                          templates={templatesQuery.data ?? []}
                        />
                      </td>
                    </tr>,
                  );
                }
                return rows;
              })}
            </tbody>
          </table>
        )}
      </section>

      {canManage && <TaskTemplatesManager templates={templatesQuery.data ?? []} />}
    </main>
  );
}

export default SessionsPage;
