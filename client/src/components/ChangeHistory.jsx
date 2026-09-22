import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteParameterChange, listParameterChanges } from '../api/parameters.js';
import { describeChange, formatDateTime } from '../lib/format.js';
import { useAuth } from '../auth/AuthContext.jsx';

function ChangeRow({ change }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const undo = useMutation({
    mutationFn: () => deleteParameterChange(change.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parameter-changes'] });
      queryClient.invalidateQueries({ queryKey: ['period-parameters'] });
    },
  });

  function handleUndo() {
    const ok = window.confirm(
      `Undo this change to ${change.parameterName} (Period ${change.periodNumber})? ` +
        'Periods will use parameters as if it never happened. ' +
        'Saved scores are never deleted.'
    );
    if (ok) undo.mutate();
  }

  return (
    <tr>
      <td>Period {change.periodNumber}</td>
      <td>{change.parameterName}</td>
      <td>{describeChange(change)}</td>
      <td>{formatDateTime(change.createdAt)}</td>
      {can('parameters.manage') && (
        <td className="actions">
          <button type="button" onClick={handleUndo} disabled={undo.isPending}>
            {undo.isPending ? 'Undoing...' : 'Undo'}
          </button>
          {undo.isError && <p className="error">{undo.error.message}</p>}
        </td>
      )}
    </tr>
  );
}

function ChangeHistory() {
  const { can } = useAuth();
  const {
    data: changes,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ['parameter-changes'],
    queryFn: listParameterChanges,
  });

  if (isPending) return <p>Loading history...</p>;
  if (isError) return <p className="error">{error.message}</p>;
  if (changes.length === 0) return <p>No changes yet.</p>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>From</th>
            <th>Parameter</th>
            <th>Change</th>
            <th>Recorded</th>
            {can('parameters.manage') && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <ChangeRow key={change.id} change={change} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ChangeHistory;