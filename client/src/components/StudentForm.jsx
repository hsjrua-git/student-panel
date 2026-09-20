import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createStudent } from '../api/students.js';
import { formatStudentCode } from '../lib/format.js';

function StudentForm() {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [problem, setProblem] = useState(null);

  const mutation = useMutation({
    mutationFn: createStudent,
    onSuccess: () => {
      setFullName('');
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    const name = fullName.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 100) {
      mutation.reset();
      setProblem('Full name must be between 2 and 100 characters.');
      return;
    }
    setProblem(null);
    mutation.mutate(name);
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

      {problem && <p className="error">{problem}</p>}
      {mutation.isError && <p className="error">{mutation.error.message}</p>}
      {mutation.isSuccess && (
        <p className="success">
          Added {mutation.data.fullName} with code{' '}
          <strong>{formatStudentCode(mutation.data.studentCode)}</strong>
        </p>
      )}
    </form>
  );
}

export default StudentForm;