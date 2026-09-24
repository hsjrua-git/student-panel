import { useQuery } from '@tanstack/react-query';
import { listParameters } from '../api/parameters.js';
import ParameterRow from './ParameterRow.jsx';

function ParametersTable() {
  const {
    data: parameters,
    isPending,
    isError,
    error,
  } = useQuery({ queryKey: ['parameters'], queryFn: listParameters });

  if (isPending) return <p className="hint">Loading parameters…</p>;
  if (isError) return <p className="error">{error.message}</p>;
  if (parameters.length === 0) {
    return <p className="hint">No parameters yet. Add the first one above.</p>;
  }

  return (
    <div className="param-grid">
      {parameters.map((parameter) => (
        <ParameterRow key={parameter.id} parameter={parameter} />
      ))}
    </div>
  );
}

export default ParametersTable;