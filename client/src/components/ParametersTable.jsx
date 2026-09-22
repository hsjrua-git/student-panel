import { useQuery } from '@tanstack/react-query';
import { listParameters } from '../api/parameters.js';
import ParameterRow from './ParameterRow.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

function ParametersTable() {
  const { can } = useAuth();
  const {
    data: parameters,
    isPending,
    isError,
    error,
  } = useQuery({ queryKey: ['parameters'], queryFn: listParameters });

  if (isPending) return <p>Loading parameters...</p>;
  if (isError) return <p className="error">{error.message}</p>;
  if (parameters.length === 0) {
    return <p>No parameters yet. Add the first one above.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Unit</th>
            <th>Range</th>
            {can('parameters.manage') && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {parameters.map((parameter) => (
            <ParameterRow key={parameter.id} parameter={parameter} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ParametersTable;