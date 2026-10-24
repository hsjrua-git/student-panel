import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveTeacher,
  createTeacher,
  listTeachers,
  updateTeacher,
} from '../api/teachers.js';
import { useAuth } from '../auth/AuthContext.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { formatIsoDate } from '../lib/format.js';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';

// A teacher's full identity record. Creation requires everything up front;
// editing and archiving follow the same pattern as students and groups.
function TeacherForm({ teacher, onDone }) {
  const queryClient = useQueryClient();
  const isEdit = teacher !== null;
  const [fullName, setFullName] = useState(teacher?.fullName ?? '');
  const [birthDate, setBirthDate] = useState(teacher?.birthDate ?? '');
  const [nationalId, setNationalId] = useState(teacher?.nationalId ?? '');

  const save = useMutation({
    mutationFn: () =>
      isEdit
        ? updateTeacher(teacher.id, {
            fullName,
            birthDate,
            nationalId,
          })
        : createTeacher({ fullName, birthDate, nationalId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      if (isEdit) onDone();
      else {
        setFullName('');
        setBirthDate('');
        setNationalId('');
      }
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="edit-form">
      <label htmlFor={isEdit ? `teacher-name-${teacher.id}` : 'teacher-name'}>
        Full name
      </label>
      <input
        id={isEdit ? `teacher-name-${teacher.id}` : 'teacher-name'}
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
        maxLength={100}
        autoComplete="off"
        disabled={save.isPending}
      />

      <label htmlFor={isEdit ? `teacher-birth-${teacher.id}` : 'teacher-birth'}>
        Birth date
      </label>
      <input
        id={isEdit ? `teacher-birth-${teacher.id}` : 'teacher-birth'}
        type="date"
        value={birthDate}
        onChange={(event) => setBirthDate(event.target.value)}
        disabled={save.isPending}
      />

      <label htmlFor={isEdit ? `teacher-nid-${teacher.id}` : 'teacher-nid'}>
        National ID
      </label>
      <input
        id={isEdit ? `teacher-nid-${teacher.id}` : 'teacher-nid'}
        value={nationalId}
        onChange={(event) => setNationalId(event.target.value)}
        inputMode="numeric"
        pattern="[0-9]{10}"
        maxLength={10}
        autoComplete="off"
        disabled={save.isPending}
      />

      <div className="row">
        <button type="submit" disabled={save.isPending}>
          {save.isPending
            ? 'Saving...'
            : isEdit
              ? 'Save teacher'
              : 'Add teacher'}
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
          Added {save.data.teacher.fullName}.
        </p>
      )}
    </form>
  );
}

function TeachersPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 250);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const teachersQuery = useQuery({
    queryKey: ['teachers', { search: debounced, includeArchived }],
    queryFn: () => listTeachers({ search: debounced, includeArchived }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['teachers'] });
  const archive = useMutation({
    mutationFn: (id) => archiveTeacher(id),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: (teacher) => updateTeacher(teacher.id, { archived: false }),
    onSuccess: invalidate,
  });
  const change = archive.isPending || restore.isPending;

  return (
    <main className="wide">
      <div className="page-head">
        <div>
          <h1>Teachers</h1>
          <p className="hint">
            The teaching staff, each with a full identity record.
          </p>
        </div>
      </div>

      {can('teachers.manage') && editingId === null && (
        <section className="section-card">
          <h2>Add a teacher</h2>
          <TeacherForm teacher={null} onDone={() => {}} />
        </section>
      )}

      <section className="section-card">
        <div className="toolbar">
          <input
            type="search"
            className="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, code or national ID"
            aria-label="Search teachers"
          />
          <label className="hint">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
            />
            Include archived
          </label>
        </div>

        {teachersQuery.isPending && <p className="hint">Loading…</p>}
        {teachersQuery.isError && (
          <p className="error" role="alert">
            {teachersQuery.error.message}
          </p>
        )}
        {teachersQuery.data?.length === 0 && (
          <EmptyState
            title="No teachers"
            description="Add the first teacher with the form above."
          />
        )}

        {teachersQuery.data && teachersQuery.data.length > 0 && (
          <table>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Full name</th>
                <th scope="col">Birth date</th>
                <th scope="col">National ID</th>
                {can('teachers.manage') && <th scope="col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {teachersQuery.data.map((teacher) =>
                editingId === teacher.id ? (
                  <tr key={teacher.id}>
                    <td colSpan={can('teachers.manage') ? 5 : 4}>
                      <TeacherForm
                        teacher={teacher}
                        onDone={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={teacher.id}
                    className={teacher.archivedAt ? 'stale' : undefined}
                  >
                    <td>
                      <code>{teacher.code}</code>
                    </td>
                    <th scope="row">{teacher.fullName}</th>
                    <td>
                      {teacher.birthDate ? formatIsoDate(teacher.birthDate) : '—'}
                    </td>
                    <td>{teacher.nationalId}</td>
                    {can('teachers.manage') && (
                      <td>
                        {teacher.archivedAt ? (
                          <button
                            type="button"
                            className="quiet"
                            disabled={change}
                            onClick={() => restore.mutate(teacher)}
                          >
                            Restore
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="quiet"
                              disabled={change}
                              onClick={() => setEditingId(teacher.id)}
                            >
                              Edit
                            </button>{' '}
                            <button
                              type="button"
                              className="quiet"
                              disabled={change}
                              onClick={() => archive.mutate(teacher.id)}
                            >
                              Archive
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

export default TeachersPage;
