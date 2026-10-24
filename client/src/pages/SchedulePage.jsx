import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveAssignment,
  archiveInterval,
  createAssignment,
  createInterval,
  listAssignments,
  listIntervals,
  listStudentMemberships,
  updateAssignment,
  updateInterval,
} from '../api/schedule.js';
import { listGroups } from '../api/groups.js';
import { listStudents } from '../api/students.js';
import { listTeachers } from '../api/teachers.js';
import { useAuth } from '../auth/AuthContext.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { formatIsoDate, toIsoDate } from '../lib/format.js';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';

// The schedule lists recurring assignments: a teacher meets a group (or one
// student) on an interval from an anchor date. Sessions are generated from
// these; the assignment itself stores no occurrences.

function formatEvery(every) {
  if (!every) return '—';
  if (every.months) return `${every.months} ${every.months === 1 ? 'month' : 'months'}`;
  if (every.days) return `${every.days} ${every.days === 1 ? 'day' : 'days'}`;
  return '—';
}

function nextOccurrence(anchorDate, every) {
  const anchor = new Date(`${anchorDate}T00:00:00`);
  if (Number.isNaN(anchor.getTime()) || !every) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (anchor >= today) return anchor;
  if (every.months) {
    const next = new Date(anchor);
    let guard = 0;
    while (next < today && guard++ < 1200) {
      next.setMonth(next.getMonth() + every.months);
    }
    return next;
  }
  if (every.days) {
    const step = every.days * 86_400_000;
    const diff = today.getTime() - anchor.getTime();
    return new Date(anchor.getTime() + Math.ceil(diff / step) * step);
  }
  return null;
}

function targetLabel(assignment) {
  if (assignment.groupId) return `Group ${assignment.groupName}`;
  return `${assignment.studentName} (${assignment.studentGroupName})`;
}

function AssignmentForm({ assignment, teachers, intervals, groups, onDone }) {
  const queryClient = useQueryClient();
  const isEdit = assignment !== null;

  const [teacherId, setTeacherId] = useState(assignment?.teacherId ?? '');
  const [intervalId, setIntervalId] = useState(assignment?.intervalId ?? '');
  const [anchorDate, setAnchorDate] = useState(assignment?.anchorDate ?? toIsoDate(new Date()));
  const [name, setName] = useState(assignment?.name ?? '');

  // Individual targeting: search a student, then pick one of their open
  // memberships (which group's membership the schedule attaches to).
  const [targetKind, setTargetKind] = useState('group');
  const [groupId, setGroupId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const debouncedSearch = useDebouncedValue(studentSearch, 250);
  const [pickedStudent, setPickedStudent] = useState(null);
  const [membershipId, setMembershipId] = useState('');

  const studentQuery = useQuery({
    queryKey: ['students', 'schedule-target', debouncedSearch],
    queryFn: () => listStudents({ search: debouncedSearch, pageSize: 10, sort: 'name' }),
    enabled: !isEdit && targetKind === 'member' && debouncedSearch.trim() !== '',
  });
  const membershipQuery = useQuery({
    queryKey: ['schedule-memberships', pickedStudent?.id],
    queryFn: () => listStudentMemberships(pickedStudent.id),
    enabled: !isEdit && pickedStudent !== null,
  });
  const memberships = membershipQuery.data ?? [];
  // A student with exactly one open membership does not need a picker: the
  // schedule simply attaches to that membership.
  const effectiveMembershipId =
    membershipId || (memberships.length === 1 ? memberships[0].membershipId : '');

  const save = useMutation({
    mutationFn: () => {
      if (isEdit) {
        return updateAssignment(assignment.id, {
          teacherId,
          intervalId,
          anchorDate,
          name: name.trim() === '' ? null : name.trim(),
        });
      }
      const body = {
        teacherId,
        intervalId,
        anchorDate,
        name: name.trim() === '' ? null : name.trim(),
      };
      if (targetKind === 'group') body.groupId = groupId;
      else body.membershipId = effectiveMembershipId;
      return createAssignment(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      if (isEdit) onDone();
      else {
        setName('');
        setGroupId('');
        setPickedStudent(null);
        setMembershipId('');
        setStudentSearch('');
      }
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    save.mutate();
  }

  function pickStudent(student) {
    setPickedStudent(student);
    setMembershipId('');
  }

  return (
    <form onSubmit={handleSubmit} className="edit-form">
      <label htmlFor="assignment-teacher">Teacher</label>
      <select
        id="assignment-teacher"
        value={teacherId}
        onChange={(event) => setTeacherId(event.target.value)}
        disabled={save.isPending}
      >
        <option value="">Choose a teacher…</option>
        {teachers
          .filter((teacher) => !teacher.archivedAt)
          .map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.fullName}
            </option>
          ))}
      </select>

      <label htmlFor="assignment-interval">Every</label>
      <select
        id="assignment-interval"
        value={intervalId}
        onChange={(event) => setIntervalId(event.target.value)}
        disabled={save.isPending}
      >
        <option value="">Choose an interval…</option>
        {intervals
          .filter((interval) => !interval.archivedAt)
          .map((interval) => (
            <option key={interval.id} value={interval.id}>
              {interval.name} ({formatEvery(interval.every)})
            </option>
          ))}
      </select>

      <label htmlFor="assignment-anchor">Starting from (anchor date)</label>
      <input
        id="assignment-anchor"
        type="date"
        value={anchorDate}
        onChange={(event) => setAnchorDate(event.target.value)}
        disabled={save.isPending}
      />

      <label htmlFor="assignment-name">Name (optional)</label>
      <input
        id="assignment-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={100}
        placeholder="e.g. Monday maths"
        autoComplete="off"
        disabled={save.isPending}
      />

      {isEdit ? (
        <p className="hint">
          Target: {targetLabel(assignment)} — archive this assignment and create
          a new one to change the target.
        </p>
      ) : (
        <>
          <label>Target</label>
          <div className="row">
            <label className="hint">
              <input
                type="radio"
                name="target-kind"
                checked={targetKind === 'group'}
                onChange={() => setTargetKind('group')}
                disabled={save.isPending}
              />{' '}
              Whole group
            </label>
            <label className="hint">
              <input
                type="radio"
                name="target-kind"
                checked={targetKind === 'member'}
                onChange={() => setTargetKind('member')}
                disabled={save.isPending}
              />{' '}
              One student
            </label>
          </div>

          {targetKind === 'group' ? (
            <>
              <label htmlFor="assignment-group">Group</label>
              <select
                id="assignment-group"
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
                disabled={save.isPending}
              >
                <option value="">Choose a group…</option>
                {groups
                  .filter((group) => !group.archivedAt)
                  .map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
              </select>
            </>
          ) : (
            <>
              <label htmlFor="assignment-student">Student</label>
              {pickedStudent === null ? (
                <>
                  <input
                    id="assignment-student"
                    type="search"
                    className="search"
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                    placeholder="Search by name or code"
                    autoComplete="off"
                    disabled={save.isPending}
                  />
                  <ul className="plain-list">
                    {studentQuery.data?.students.map((student) => (
                      <li key={student.id}>
                        {student.fullName}{' '}
                        <code className="hint">{student.studentCode}</code>{' '}
                        <button
                          type="button"
                          className="quiet"
                          onClick={() => pickStudent(student)}
                          disabled={save.isPending}
                        >
                          Choose
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="row">
                  <span>
                    {pickedStudent.fullName}{' '}
                    {memberships.length > 1 && (
                      <select
                        aria-label="Which group membership"
                        value={membershipId}
                        onChange={(event) => setMembershipId(event.target.value)}
                        disabled={save.isPending}
                      >
                        <option value="">Which group?…</option>
                        {memberships.map((membership) => (
                          <option key={membership.membershipId} value={membership.membershipId}>
                            {membership.groupName}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => {
                      setPickedStudent(null);
                      setMembershipId('');
                    }}
                    disabled={save.isPending}
                  >
                    Change
                  </button>
                </div>
              )}
              {pickedStudent !== null && memberships.length === 0 && (
                <p className="hint">
                  This student is not currently in any live group.
                </p>
              )}
            </>
          )}
        </>
      )}

      <div className="row">
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving...' : isEdit ? 'Save assignment' : 'Add assignment'}
        </button>
        {isEdit && (
          <button type="button" onClick={onDone} disabled={save.isPending}>
            Cancel
          </button>
        )}
      </div>
      {save.isError && (
        <p className="error" role="alert">
          {save.error.message}
        </p>
      )}
      {save.isSuccess && !isEdit && (
        <p className="success" role="status">
          Assignment added.
        </p>
      )}
    </form>
  );
}

function IntervalsManager({ intervals }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [count, setCount] = useState(7);
  const [unit, setUnit] = useState('days');

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['intervals'] });
  const save = useMutation({
    mutationFn: () =>
      createInterval(
        unit === 'months'
          ? { name, everyMonths: count }
          : { name, everyDays: count },
      ),
    onSuccess: () => {
      invalidate();
      setName('');
    },
  });
  const archive = useMutation({
    mutationFn: (id) => archiveInterval(id),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: (id) => updateInterval(id, { archived: false }),
    onSuccess: invalidate,
  });

  function handleSubmit(event) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <section className="section-card">
      <h2>Session intervals</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Every</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {intervals.map((interval) => (
            <tr key={interval.id} className={interval.archivedAt ? 'stale' : undefined}>
              <th scope="row">{interval.name}</th>
              <td>{formatEvery(interval.every)}</td>
              <td>
                {interval.archivedAt ? (
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => restore.mutate(interval.id)}
                    disabled={archive.isPending || restore.isPending}
                  >
                    Restore
                  </button>
                ) : (
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => archive.mutate(interval.id)}
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

      <form onSubmit={handleSubmit} className="edit-form">
        <label htmlFor="interval-name">New interval name</label>
        <input
          id="interval-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          placeholder="e.g. Weekly"
          autoComplete="off"
          disabled={save.isPending}
        />
        <label htmlFor="interval-count">Every</label>
        <div className="row">
          <input
            id="interval-count"
            type="number"
            min={1}
            max={unit === 'months' ? 24 : 365}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            disabled={save.isPending}
          />
          <select
            aria-label="Unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            disabled={save.isPending}
          >
            <option value="days">days</option>
            <option value="months">months</option>
          </select>
          <button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Adding...' : 'Add interval'}
          </button>
        </div>
        {save.isError && <p className="error">{save.error.message}</p>}
      </form>
    </section>
  );
}

function SchedulePage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const canManage = can('schedule.manage');
  const canPickTeachers = can('teachers.view');
  const canPickGroups = can('students.view');
  const canUseForm = canManage && canPickTeachers && canPickGroups;

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', { includeArchived }],
    queryFn: () => listAssignments({ includeArchived }),
  });
  const intervalsQuery = useQuery({
    queryKey: ['intervals', { includeArchived: true }],
    queryFn: () => listIntervals({ includeArchived: true }),
  });
  const teachersQuery = useQuery({
    queryKey: ['teachers', { search: '', includeArchived: true }],
    queryFn: () => listTeachers({ includeArchived: true }),
    enabled: canUseForm,
  });
  const groupsQuery = useQuery({
    queryKey: ['groups', { includeArchived: true }],
    queryFn: () => listGroups({ includeArchived: true }),
    enabled: canUseForm,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['assignments'] });
  const archive = useMutation({
    mutationFn: (id) => archiveAssignment(id),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: (assignment) =>
      updateAssignment(assignment.id, { archived: false }),
    onSuccess: invalidate,
  });

  const assignments = assignmentsQuery.data ?? [];
  const intervals = intervalsQuery.data ?? [];

  return (
    <main className="wide">
      <div className="page-head">
        <div>
          <h1>Schedule</h1>
          <p className="hint">
            Recurring assignments: a teacher meets a group or one student, on a
            rhythm, from a start date.
          </p>
        </div>
      </div>

      {canUseForm && editingId === null && (
        <section className="section-card">
          <h2>Add an assignment</h2>
          <AssignmentForm
            assignment={null}
            teachers={teachersQuery.data ?? []}
            intervals={intervals}
            groups={groupsQuery.data ?? []}
            onDone={() => {}}
          />
        </section>
      )}

      <section className="section-card">
        <div className="toolbar">
          <label className="hint">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
            />
            Include archived
          </label>
        </div>

        {assignmentsQuery.isPending && <p className="hint">Loading…</p>}
        {assignmentsQuery.isError && (
          <p className="error" role="alert">
            {assignmentsQuery.error.message}
          </p>
        )}
        {assignments.length === 0 && !assignmentsQuery.isPending && (
          <EmptyState
            title="No assignments yet"
            description={
              canUseForm
                ? 'Add the first recurring assignment with the form above.'
                : 'An administrator needs to set up the schedule first.'
            }
          />
        )}

        {assignments.length > 0 && (
          <table>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Name</th>
                <th scope="col">Teacher</th>
                <th scope="col">Target</th>
                <th scope="col">Every</th>
                <th scope="col">Anchor</th>
                <th scope="col">Next</th>
                {canManage && <th scope="col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => {
                const next = nextOccurrence(assignment.anchorDate, assignment.every);
                return editingId === assignment.id ? (
                  <tr key={assignment.id}>
                    <td colSpan={canManage ? 8 : 7}>
                      <AssignmentForm
                        assignment={assignment}
                        teachers={teachersQuery.data ?? []}
                        intervals={intervals}
                        groups={groupsQuery.data ?? []}
                        onDone={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={assignment.id}
                    className={assignment.archivedAt ? 'stale' : undefined}
                  >
                    <td>
                      <code>{assignment.code}</code>
                    </td>
                    <td>{assignment.name ?? '—'}</td>
                    <td>{assignment.teacherName}</td>
                    <td>{targetLabel(assignment)}</td>
                    <td>
                      {assignment.intervalName}{' '}
                      <span className="hint">({formatEvery(assignment.every)})</span>
                    </td>
                    <td>{formatIsoDate(assignment.anchorDate)}</td>
                    <td>
                      {next && !assignment.archivedAt
                        ? formatIsoDate(toIsoDate(next))
                        : '—'}
                    </td>
                    {canManage && (
                      <td>
                        {assignment.archivedAt ? (
                          <button
                            type="button"
                            className="quiet"
                            onClick={() => restore.mutate(assignment)}
                            disabled={archive.isPending || restore.isPending}
                          >
                            Restore
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="quiet"
                              onClick={() => setEditingId(assignment.id)}
                              disabled={archive.isPending || restore.isPending}
                            >
                              Edit
                            </button>{' '}
                            <button
                              type="button"
                              className="quiet"
                              onClick={() => archive.mutate(assignment.id)}
                              disabled={archive.isPending || restore.isPending}
                            >
                              Archive
                            </button>
                          </>
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

      {canManage && intervals.length > 0 && (
        <IntervalsManager intervals={intervals} />
      )}
    </main>
  );
}

export default SchedulePage;
