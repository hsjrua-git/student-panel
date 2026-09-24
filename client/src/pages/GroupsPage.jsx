import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext.jsx';
import EmptyState from '../components/EmptyState.jsx';
import {
  archiveGroup,
  createGroup,
  listGroupMembers,
  listGroups,
  updateGroup,
  updateGroupMembers,
} from '../api/groups.js';
import { listStudents } from '../api/students.js';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';

function buildTree(groups) {
  const byParent = new Map();
  for (const group of groups) {
    const key = group.parentId ?? 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(group);
  }
  const walk = (parentKey, depth) => {
    const children = byParent.get(parentKey) ?? [];
    return children.flatMap((group) => [
      { ...group, depth },
      ...walk(group.id, depth + 1),
    ]);
  };
  return walk('root', 0);
}

function MemberPanel({ group, onClose }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 250);

  const membersQuery = useQuery({
    queryKey: ['group-members', group.id],
    queryFn: () => listGroupMembers(group.id),
  });
  const searchQuery = useQuery({
    queryKey: ['students', 'group-search', debounced],
    queryFn: () => listStudents({ search: debounced, pageSize: 20, sort: 'name' }),
    enabled: debounced.trim() !== '',
  });

  const change = useMutation({
    mutationFn: (payload) => updateGroupMembers(group.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-members', group.id] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  const memberIds = new Set((membersQuery.data ?? []).map((s) => s.id));

  return (
    <section className="group-members section-card">
      <div className="toolbar">
        <h2>Members of {group.name}</h2>
        <button type="button" onClick={onClose}>
          Done
        </button>
      </div>

      <div className="two-col">
        <div>
          <h3>In this group</h3>
          {membersQuery.isPending && <p className="hint">Loading…</p>}
          {membersQuery.data?.length === 0 && (
            <p className="hint">No students yet.</p>
          )}
          <ul className="plain-list">
            {membersQuery.data?.map((student) => (
              <li key={student.id}>
                {student.fullName}{' '}
                <code className="hint">{student.studentCode}</code>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => change.mutate({ remove: [student.id] })}
                  disabled={change.isPending}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3>Add students</h3>
          <input
            type="search"
            className="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or code"
            aria-label="Search students to add"
          />
          <ul className="plain-list">
            {searchQuery.data?.students
              .filter((student) => !memberIds.has(student.id))
              .map((student) => (
                <li key={student.id}>
                  {student.fullName}{' '}
                  <code className="hint">{student.studentCode}</code>
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => change.mutate({ add: [student.id] })}
                    disabled={change.isPending}
                  >
                    Add
                  </button>
                </li>
              ))}
          </ul>
        </div>
      </div>
      {change.isError && (
        <p className="error" role="alert">
          {change.error.message}
        </p>
      )}
    </section>
  );
}

function NewGroupForm({ groups }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');

  const create = useMutation({
    mutationFn: createGroup,
    onSuccess: () => {
      setName('');
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    create.mutate({ name, parentId: parentId || null });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <label>
          Group name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            autoComplete="off"
          />
        </label>
        <label>
          Inside
          <select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">(top level)</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {' '.repeat(group.depth * 2)}
                {group.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="submit" disabled={create.isPending || name.trim() === ''}>
        {create.isPending ? 'Adding…' : 'Add group'}
      </button>
      {create.isError && (
        <p className="error" role="alert">
          {create.error.message}
        </p>
      )}
    </form>
  );
}

function GroupRow({ group, groups, onManage }) {
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.name);
  const [moving, setMoving] = useState(false);
  const [parentId, setParentId] = useState(group.parentId ?? '');

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['groups'] });

  const update = useMutation({
    mutationFn: (fields) => updateGroup(group.id, fields),
    onSuccess: () => {
      setRenaming(false);
      setMoving(false);
      invalidate();
    },
  });
  const archive = useMutation({
    mutationFn: () => archiveGroup(group.id),
    onSuccess: invalidate,
  });

  return (
    <tr>
      <td>
        <span style={{ paddingLeft: `${group.depth * 1.25}rem` }}>
          {renaming ? (
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              aria-label={`Rename ${group.name}`}
            />
          ) : (
            group.name
          )}
        </span>
      </td>
      <td>{group.memberCount}</td>
      <td className="actions">
        {renaming ? (
          <>
            <button
              type="button"
              onClick={() => update.mutate({ name })}
              disabled={update.isPending}
            >
              Save
            </button>
            <button type="button" onClick={() => setRenaming(false)}>
              Cancel
            </button>
          </>
        ) : moving ? (
          <>
            <select
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              aria-label={`Move ${group.name}`}
            >
              <option value="">(top level)</option>
              {groups
                .filter((candidate) => candidate.id !== group.id)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {' '.repeat(candidate.depth * 2)}
                    {candidate.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={() => update.mutate({ parentId: parentId || null })}
              disabled={update.isPending}
            >
              Move
            </button>
            <button type="button" onClick={() => setMoving(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => onManage(group)}>
              Members
            </button>
            <button type="button" onClick={() => setRenaming(true)}>
              Rename
            </button>
            <button type="button" onClick={() => setMoving(true)}>
              Move
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Archive "${group.name}"?`)) archive.mutate();
              }}
              disabled={archive.isPending}
            >
              Archive
            </button>
          </>
        )}
        {(update.isError || archive.isError) && (
          <p className="error" role="alert">
            {(update.error ?? archive.error).message}
          </p>
        )}
      </td>
    </tr>
  );
}

function GroupsPage() {
  const { can } = useAuth();
  const [managing, setManaging] = useState(null);

  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: () => listGroups() });
  const tree = useMemo(
    () => (groupsQuery.data ? buildTree(groupsQuery.data) : []),
    [groupsQuery.data]
  );

  if (!can('groups.manage')) {
    return (
      <main>
        <EmptyState
          title="Read-only access"
          description="You do not have permission to manage groups."
        />
      </main>
    );
  }

  return (
    <main className="wide">
      <h1>Groups</h1>
      <p className="hint">
        Organise students into groups and subgroups (any depth). Filtering by a
        group includes everyone in its subgroups too.
      </p>

      <section className="section-card">
        <h2>Add a group</h2>
        <NewGroupForm groups={tree} />
      </section>

      <section className="section-card">
        <h2>Groups</h2>
        {groupsQuery.isPending && <p className="hint">Loading…</p>}
        {groupsQuery.isError && (
          <p className="error">{groupsQuery.error.message}</p>
        )}
        {groupsQuery.data && tree.length === 0 && (
          <p className="hint">No groups yet.</p>
        )}
        {tree.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Members</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tree.map((group) => (
                  <GroupRow
                    key={group.id}
                    group={group}
                    groups={tree}
                    onManage={setManaging}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {managing && can('groups.assign') && (
        <MemberPanel group={managing} onClose={() => setManaging(null)} />
      )}
    </main>
  );
}

export default GroupsPage;
