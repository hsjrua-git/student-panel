import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { deleteStudent, renameStudent } from '../api/students.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { formatDateTime, formatStudentCode } from '../lib/format.js';
import { usePreferences } from '../preferences/PreferencesContext.jsx';

function StudentRow({ student }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { preferences } = usePreferences();
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(student.fullName);

  function refreshList() {
    queryClient.invalidateQueries({ queryKey: ['students'] });
  }

  const rename = useMutation({
    mutationFn: (fullName) => renameStudent(student.id, fullName),
    onSuccess: () => {
      setIsEditing(false);
      refreshList();
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteStudent(student.id),
    onSuccess: refreshList,
  });

  function startEditing() {
    setDraftName(student.fullName);
    rename.reset();
    setIsEditing(true);
  }

  function handleSave(event) {
    event.preventDefault();
    rename.mutate(draftName);
  }

  function handleDelete() {
    const code = formatStudentCode(student.studentCode);
    if (window.confirm(`Delete ${student.fullName} (${code})?`)) {
      remove.mutate();
    }
  }

  return (
    <tr>
      {preferences.studentsShowCode && (
        <td className="code">{formatStudentCode(student.studentCode)}</td>
      )}
      <td>
        {isEditing ? (
          <form onSubmit={handleSave} className="row">
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              aria-label={`New name for ${student.fullName}`}
              autoFocus
            />
            <button type="submit" disabled={rename.isPending}>
              Save
            </button>
            <button type="button" onClick={() => setIsEditing(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <Link to={`/students/${student.id}`}>{student.fullName}</Link>
        )}
        {isEditing && rename.isError && (
          <p className="error">{rename.error.message}</p>
        )}
        {remove.isError && <p className="error">{remove.error.message}</p>}
      </td>
      {preferences.studentsShowAdded && (
        <td>{formatDateTime(student.createdAt)}</td>
      )}
      {(can('students.edit') || can('students.delete')) && (
        <td className="actions">
          {can('students.edit') && (
            <button type="button" onClick={startEditing} disabled={isEditing}>
              Rename
            </button>
          )}
          {can('students.delete') && (
            <button
              type="button"
              className="danger"
              onClick={handleDelete}
              disabled={remove.isPending}
            >
              {remove.isPending ? 'Deleting...' : 'Delete'}
            </button>
          )}
        </td>
      )}
    </tr>
  );
}

export default StudentRow;