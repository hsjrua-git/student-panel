import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listFieldDefinitions } from '../api/fields.js';
import { updateStudent } from '../api/students.js';
import { useAuth } from '../auth/AuthContext.jsx';
import StudentFieldInputs from './StudentFieldInputs.jsx';
import { buildExtraPatch, extraToValues } from '../lib/studentFields.js';

function displayValue(definition, raw) {
  if (raw === undefined || raw === null || raw === '') return '—';
  if (definition.fieldType === 'yes_no') return raw ? 'Yes' : 'No';
  return String(raw);
}

function StudentFieldsSection({ student }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [values, setValues] = useState({});

  const fieldsQuery = useQuery({
    queryKey: ['field-definitions'],
    queryFn: () => listFieldDefinitions(),
  });
  const definitions = fieldsQuery.data ?? [];

  const save = useMutation({
    mutationFn: (extra) => updateStudent(student.id, { extra }),
    onSuccess: () => {
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['student', student.id] });
    },
  });

  if (fieldsQuery.isPending || definitions.length === 0) return null;

  function startEditing() {
    setValues(extraToValues(definitions, student.extra));
    save.reset();
    setIsEditing(true);
  }

  function handleChange(id, value) {
    setValues((current) => ({ ...current, [id]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    save.mutate(buildExtraPatch(definitions, values));
  }

  return (
    <section>
      <h2>Details</h2>
      {isEditing ? (
        <form onSubmit={handleSubmit}>
          <StudentFieldInputs
            definitions={definitions}
            values={values}
            onChange={handleChange}
            disabled={save.isPending}
            idPrefix={`edit-${student.id}`}
          />
          <div className="row">
            <button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving...' : 'Save details'}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={save.isPending}
            >
              Cancel
            </button>
          </div>
          {save.isError && <p className="error">{save.error.message}</p>}
        </form>
      ) : (
        <>
          <dl className="field-list">
            {definitions.map((definition) => (
              <div className="field-list-row" key={definition.id}>
                <dt>{definition.label}</dt>
                <dd>{displayValue(definition, student.extra?.[definition.id])}</dd>
              </div>
            ))}
          </dl>
          {can('students.edit') && (
            <button type="button" onClick={startEditing}>
              Edit details
            </button>
          )}
        </>
      )}
    </section>
  );
}

export default StudentFieldsSection;
