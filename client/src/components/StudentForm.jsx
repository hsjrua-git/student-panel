import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createStudent } from '../api/students.js';
import { listFieldDefinitions } from '../api/fields.js';
import { formatStudentCode } from '../lib/format.js';
import StudentFieldInputs from './StudentFieldInputs.jsx';
import { cleanExtra } from '../lib/studentFields.js';

function StudentForm() {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [fieldValues, setFieldValues] = useState({});
  const [problem, setProblem] = useState(null);

  const fieldsQuery = useQuery({
    queryKey: ['field-definitions'],
    queryFn: () => listFieldDefinitions(),
  });
  const definitions = fieldsQuery.data ?? [];

  const mutation = useMutation({
    mutationFn: ({ name, extra }) => createStudent(name, extra),
    onSuccess: () => {
      setFullName('');
      setFieldValues({});
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });

  function handleFieldChange(id, value) {
    if (!mutation.isIdle) mutation.reset();
    setFieldValues((current) => ({ ...current, [id]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const name = fullName.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 100) {
      mutation.reset();
      setProblem('Full name must be between 2 and 100 characters.');
      return;
    }
    setProblem(null);
    const extra = cleanExtra(definitions, fieldValues);
    mutation.mutate({ name, extra: Object.keys(extra).length ? extra : undefined });
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="fullName">Full name</label>
      <div className="row">
        <input
          id="fullName"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="e.g. Maria Lopez"
          maxLength={200}
          autoComplete="off"
        />
        <button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Adding...' : 'Add student'}
        </button>
      </div>

      <StudentFieldInputs
        definitions={definitions}
        values={fieldValues}
        onChange={handleFieldChange}
        disabled={mutation.isPending}
        idPrefix="new-student"
      />

      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {mutation.isError && (
        <p className="error" role="alert">
          {mutation.error.message}
        </p>
      )}
      {mutation.isSuccess && (
        <p className="success" role="status">
          Added {mutation.data.fullName} with code{' '}
          <strong>{formatStudentCode(mutation.data.studentCode)}</strong>
        </p>
      )}
    </form>
  );
}

export default StudentForm;
