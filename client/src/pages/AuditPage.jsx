import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listAudit } from '../api/audit.js';
import { useAuth } from '../auth/AuthContext.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { CATEGORY_OPTIONS, describeAudit } from '../lib/audit.js';
import { formatDateTime, formatStudentCode } from '../lib/format.js';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';

function Details({ entry }) {
  const details = entry.details ?? {};

  if (entry.action === 'scores.save' && Array.isArray(details.changes)) {
    return (
      <>
        <table className="audit-changes">
          <thead>
            <tr>
              <th>Student</th>
              <th>Parameter</th>
              <th className="num">From</th>
              <th className="num">To</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {details.changes.map((change) => (
              <tr key={`${change.studentId}:${change.parameterId}`}>
                <td>
                  {change.student} ({formatStudentCode(change.studentCode)})
                </td>
                <td>{change.parameter}</td>
                <td className="num">{change.from ?? '—'}</td>
                <td className="num">{change.to ?? 'cleared'}</td>
                <td>{change.override ? 'Locked, overridden' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {details.moreChanges > 0 && (
          <p className="hint">…and {details.moreChanges} more changes.</p>
        )}
      </>
    );
  }
  return <pre>{JSON.stringify(details, null, 2)}</pre>;
}

function AuditPage() {
  const { can } = useAuth();
  const [category, setCategory] = useState('');
  const [actorText, setActorText] = useState('');
  const [page, setPage] = useState(1);
  const actor = useDebouncedValue(actorText.trim(), 300);

  const query = useQuery({
    queryKey: ['audit', { category, actor, page }],
    queryFn: () => listAudit({ category, actor, page }),
    placeholderData: keepPreviousData,
    enabled: can('audit.view'),
  });

  if (!can('audit.view')) {
    return (
      <main>
        <EmptyState
          title="Read-only access"
          description="You do not have permission to see the audit log."
        />
      </main>
    );
  }

  const { data } = query;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main className="wide">
      <h1>Audit log</h1>
      <p className="hint">
        A record of who changed what, and when. Passwords are never recorded.
      </p>

      <div className="filters">
        <select
          aria-label="Category"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(1);
          }}
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          value={actorText}
          onChange={(event) => {
            setActorText(event.target.value);
            setPage(1);
          }}
          placeholder="Filter by username"
          aria-label="Filter by username"
          autoComplete="off"
        />
        <button type="button" onClick={() => query.refetch()}>
          Refresh
        </button>
      </div>

      {query.isPending && <p className="hint">Loading…</p>}
      {query.isError && <p className="error">{query.error.message}</p>}
      {data && data.entries.length === 0 && (
        <EmptyState
          title="Nothing to show"
          description="No audit entries match your filters yet."
        />
      )}
      {data && data.entries.length > 0 && (
        <section className="section-card">
          <div className="table-wrap">
            <table className={query.isPlaceholderData ? 'stale' : undefined}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="nowrap">{formatDateTime(entry.occurredAt)}</td>
                    <td>{entry.actor}</td>
                    <td>
                      {describeAudit(entry)}
                      <details className="audit-details">
                        <summary>Details</summary>
                        <Details entry={entry} />
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <button
              type="button"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages} ({data.total} entries)
            </span>
            <button
              type="button"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
            >
              Next
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

export default AuditPage;