import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { deleteParameterChange, listParameterChanges } from '../api/parameters.js';
import { errorMessage } from '../i18n/errors.js';
import { describeChange, formatDateTime } from '../lib/format.js';
import { useAuth } from '../auth/AuthContext.jsx';

function ChangeRow({ change }) {
  const { t } = useTranslation(['students', 'common']);
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
      t('parameters.undoConfirm', {
        name: change.parameterName,
        period: change.periodNumber,
      })
    );
    if (ok) undo.mutate();
  }

  return (
    <tr>
      <td>{t('parameters.periodN', { number: change.periodNumber })}</td>
      <td>{change.parameterName}</td>
      <td>{describeChange(change)}</td>
      <td>{formatDateTime(change.createdAt)}</td>
      {can('parameters.manage') && (
        <td className="actions">
          <button type="button" onClick={handleUndo} disabled={undo.isPending}>
            {undo.isPending ? t('parameters.undoing') : t('parameters.undoBtn')}
          </button>
          {undo.isError && (
            <p className="error">{errorMessage(undo.error)}</p>
          )}
        </td>
      )}
    </tr>
  );
}

function ChangeHistory() {
  const { t } = useTranslation(['students', 'common']);
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

  if (isPending) return <p>{t('parameters.loadingHistory')}</p>;
  if (isError) return <p className="error">{errorMessage(error)}</p>;
  if (changes.length === 0) return <p>{t('parameters.noChanges')}</p>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t('parameters.colFrom')}</th>
            <th>{t('parameters.colParameter')}</th>
            <th>{t('parameters.colChange')}</th>
            <th>{t('parameters.colRecorded')}</th>
            {can('parameters.manage') && <th>{t('common:table.actions')}</th>}
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