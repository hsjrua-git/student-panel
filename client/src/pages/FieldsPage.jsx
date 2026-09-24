import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext.jsx';
import EmptyState from '../components/EmptyState.jsx';
import {
  archiveFieldDefinition,
  createFieldDefinition,
  listFieldDefinitions,
  updateFieldDefinition,
} from '../api/fields.js';

const TYPE_LABELS = {
  text: 'Short text',
  long_text: 'Long text',
  number: 'Number',
  date: 'Date',
  yes_no: 'Yes / No',
  choice: 'Choice',
};

function NewFieldForm() {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [choicesText, setChoicesText] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);

  const create = useMutation({
    mutationFn: createFieldDefinition,
    onSuccess: () => {
      setLabel('');
      setChoicesText('');
      setIsRestricted(false);
      setFieldType('text');
      queryClient.invalidateQueries({ queryKey: ['field-definitions'] });
    },
  });

  function handleSubmit(event) {
    event.preventDefault();
    const choices =
      fieldType === 'choice'
        ? choicesText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        : [];
    create.mutate({ label, fieldType, choices, isRestricted });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <label>
          Field label
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={60}
            autoComplete="off"
          />
        </label>
        <label>
          Type
          <select
            value={fieldType}
            onChange={(event) => setFieldType(event.target.value)}
          >
            {Object.entries(TYPE_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
      </div>
      {fieldType === 'choice' && (
        <label>
          Choices (one per line)
          <textarea
            value={choicesText}
            onChange={(event) => setChoicesText(event.target.value)}
            rows={4}
          />
        </label>
      )}
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={isRestricted}
          onChange={(event) => setIsRestricted(event.target.checked)}
        />
        <span>
          Restricted — only people allowed to see restricted fields can view
          this
        </span>
      </label>
      <p className="hint">
        The type cannot be changed after the field is created. Pick carefully.
      </p>
      <button type="submit" disabled={create.isPending || label.trim() === ''}>
        {create.isPending ? 'Adding…' : 'Add field'}
      </button>
      {create.isError && (
        <p className="error" role="alert">
          {create.error.message}
        </p>
      )}
    </form>
  );
}

function FieldRow({ field }) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['field-definitions'] });

  const update = useMutation({
    mutationFn: (fields) => updateFieldDefinition(field.id, fields),
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: () => archiveFieldDefinition(field.id),
    onSuccess: invalidate,
  });

  return (
    <tr>
      <td>{field.label}</td>
      <td>{TYPE_LABELS[field.fieldType] ?? field.fieldType}</td>
      <td>
        {field.fieldType === 'choice' ? field.choices.join(', ') : '—'}
      </td>
      <td>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={field.isRestricted}
            onChange={(event) =>
              update.mutate({ isRestricted: event.target.checked })
            }
            disabled={update.isPending}
          />
          <span className="hint">Restricted</span>
        </label>
      </td>
      <td className="actions">
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Archive the "${field.label}" field?`)) {
              archive.mutate();
            }
          }}
          disabled={archive.isPending}
        >
          Archive
        </button>
        {(update.isError || archive.isError) && (
          <p className="error" role="alert">
            {(update.error ?? archive.error).message}
          </p>
        )}
      </td>
    </tr>
  );
}

function FieldsPage() {
  const { can } = useAuth();
  const query = useQuery({
    queryKey: ['field-definitions'],
    queryFn: () => listFieldDefinitions(),
  });

  if (!can('fields.manage')) {
    return (
      <main>
        <EmptyState
          title="Read-only access"
          description="You do not have permission to manage custom fields."
        />
      </main>
    );
  }

  return (
    <main className="wide">
      <h1>Custom fields</h1>
      <p className="hint">
        Add your own fields to student records — a phone number, a join date, a
        squad. Restricted fields are hidden from people without permission to
        see them.
      </p>

      <section className="section-card">
        <h2>Add a field</h2>
        <NewFieldForm />
      </section>

      <section className="section-card">
        <h2>Fields</h2>
        {query.isPending && <p className="hint">Loading…</p>}
        {query.isError && <p className="error">{query.error.message}</p>}
        {query.data && query.data.length === 0 && (
          <p className="hint">No custom fields yet.</p>
        )}
        {query.data && query.data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Type</th>
                  <th>Choices</th>
                  <th>Visibility</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((field) => (
                  <FieldRow key={field.id} field={field} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export default FieldsPage;
