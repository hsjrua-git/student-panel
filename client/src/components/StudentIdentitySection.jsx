import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateStudent } from '../api/students.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { formatIsoDate } from '../lib/format.js';

// The built-in identity fields (gender, birth date, father name, national ID)
// live on the students table itself, unlike the admin-defined custom fields
// below them. Display + edit mirror StudentFieldsSection.
function StudentIdentitySection({ student }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [problem, setProblem] = useState(null);

  const save = useMutation({
    mutationFn: (fields) => updateStudent(student.id, fields),
    onSuccess: () => {
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['student', student.id] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });

  function startEditing() {
    setGender(student.gender ?? '');
    setBirthDate(student.birthDate ?? '');
    setFatherName(student.fatherName ?? '');
    setNationalId(student.nationalId ?? '');
    setProblem(null);
    save.reset();
    setIsEditing(true);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (nationalId !== '' && !/^[0-9]{10}$/.test(nationalId)) {
      setProblem('National ID must be exactly 10 digits.');
      return;
    }
    setProblem(null);
    save.mutate({ gender, birthDate, fatherName, nationalId });
  }

  return (
    <section className="section-card">
      <h2>Identity</h2>
      {isEditing ? (
        <form onSubmit={handleSubmit}>
          <label htmlFor="student-gender">Gender</label>
          <select
            id="student-gender"
            value={gender}
            onChange={(event) => setGender(event.target.value)}
            disabled={save.isPending}
          >
            <option value="">Not set</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>

          <label htmlFor="student-birth-date">Birth date</label>
          <input
            id="student-birth-date"
            type="date"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
            disabled={save.isPending}
          />

          <label htmlFor="student-father-name">Father name</label>
          <input
            id="student-father-name"
            value={fatherName}
            onChange={(event) => setFatherName(event.target.value)}
            maxLength={100}
            autoComplete="off"
            disabled={save.isPending}
          />

          <label htmlFor="student-national-id">National ID</label>
          <input
            id="student-national-id"
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
              {save.isPending ? 'Saving...' : 'Save identity'}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={save.isPending}
            >
              Cancel
            </button>
          </div>
          {problem && (
            <p className="error" role="alert">
              {problem}
            </p>
          )}
          {save.isError && <p className="error">{save.error.message}</p>}
        </form>
      ) : (
        <>
          <dl className="field-list">
            <div className="field-list-row">
              <dt>Gender</dt>
              <dd>
                {student.gender
                  ? student.gender === 'male'
                    ? 'Male'
                    : 'Female'
                  : '—'}
              </dd>
            </div>
            <div className="field-list-row">
              <dt>Birth date</dt>
              <dd>
                {student.birthDate ? formatIsoDate(student.birthDate) : '—'}
              </dd>
            </div>
            <div className="field-list-row">
              <dt>Father name</dt>
              <dd>{student.fatherName ?? '—'}</dd>
            </div>
            <div className="field-list-row">
              <dt>National ID</dt>
              <dd>{student.nationalId ?? '—'}</dd>
            </div>
          </dl>
          {can('students.edit') && (
            <button type="button" onClick={startEditing}>
              Edit identity
            </button>
          )}
        </>
      )}
    </section>
  );
}

export default StudentIdentitySection;
