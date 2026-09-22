import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listGroups,
  listStudentGroups,
  updateGroupMembers,
} from '../api/groups.js';
import { useAuth } from '../auth/AuthContext.jsx';

function StudentGroupsSection({ student }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canAssign = can('groups.assign');
  const [choice, setChoice] = useState('');

  const memberOfQuery = useQuery({
    queryKey: ['student-groups', student.id],
    queryFn: () => listStudentGroups(student.id),
  });
  const allGroupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: () => listGroups(),
    enabled: canAssign,
  });

  const memberOf = memberOfQuery.data ?? [];
  const memberIds = new Set(memberOf.map((group) => group.id));
  const available = (allGroupsQuery.data ?? []).filter(
    (group) => !memberIds.has(group.id)
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['student-groups', student.id] });
  }

  const add = useMutation({
    mutationFn: (groupId) => updateGroupMembers(groupId, { add: [student.id] }),
    onSuccess: () => {
      setChoice('');
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (groupId) =>
      updateGroupMembers(groupId, { remove: [student.id] }),
    onSuccess: invalidate,
  });

  if (memberOfQuery.isError) {
    return (
      <section>
        <h2>Groups</h2>
        <p className="error">{memberOfQuery.error.message}</p>
      </section>
    );
  }

  const busy = add.isPending || remove.isPending;

  return (
    <section>
      <h2>Groups</h2>
      {memberOf.length === 0 ? (
        <p className="hint">Not in any group.</p>
      ) : (
        <ul className="plain-list">
          {memberOf.map((group) => (
            <li key={group.id}>
              {group.name}
              {canAssign && (
                <button
                  type="button"
                  className="link"
                  onClick={() => remove.mutate(group.id)}
                  disabled={busy}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAssign && available.length > 0 && (
        <div className="row">
          <label htmlFor={`add-group-${student.id}`} className="sr-only">
            Add to group
          </label>
          <select
            id={`add-group-${student.id}`}
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
            disabled={busy}
          >
            <option value="">Add to a group…</option>
            {available.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => choice && add.mutate(choice)}
            disabled={!choice || busy}
          >
            Add
          </button>
        </div>
      )}

      {add.isError && <p className="error">{add.error.message}</p>}
      {remove.isError && <p className="error">{remove.error.message}</p>}
    </section>
  );
}

export default StudentGroupsSection;
