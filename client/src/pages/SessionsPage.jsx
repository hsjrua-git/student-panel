import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  generateSessions,
  listSessions,
  updateSession,
} from '../api/sessions.js';
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
                return editingId === session.id ? (
                  <tr key={session.id}>
                    <td colSpan={canManage ? 7 : 6}>
                      <SessionEditRow
                        session={session}
                        onDone={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

export default SessionsPage;
