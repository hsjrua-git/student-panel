import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { listAlerts, resolveAlert, scanAlerts } from '../api/alerts.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { formatIsoDate } from '../lib/format.js';

const SHOWN = 8;

// The dashboard's session-hygiene touchpoint: past sessions that have no record
// at all (not canceled, no note, no tasks) surface here as open alerts. The
// card stays completely absent while everything is fine — or while we can't
// tell — so a healthy dashboard looks exactly as it did without this feature.
function SessionAlertsCard() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can('schedule.manage');

  const alertsQuery = useQuery({
    queryKey: ['alerts', 'open'],
    queryFn: () => listAlerts({ status: 'open' }),
    enabled: can('schedule.view'),
  });

  const resolve = useMutation({
    mutationFn: (alert) => resolveAlert(alert.id, true),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });
  const scan = useMutation({
    mutationFn: scanAlerts,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  if (alertsQuery.isPending || alertsQuery.isError) return null;
  const { alerts, truncated } = alertsQuery.data;
  if (alerts.length === 0) return null;

  const shown = alerts.slice(0, SHOWN);

  return (
    <section className="section-card">
      <h2>Sessions needing attention</h2>
      <p className="hint">
        These sessions have passed with no record — not canceled, no note, no
        tasks.
      </p>
      <ul className="plain-list">
        {shown.map((alert) => (
          <li key={alert.id}>
            {formatIsoDate(alert.sessionDate)} — {alert.teacherName} —{' '}
            <code>{alert.sessionCode}</code> —{' '}
            {alert.groupName ? `Group ${alert.groupName}` : alert.studentName ?? '—'}
            {canManage && (
              <>
                {' '}
                <button
                  type="button"
                  className="quiet"
                  onClick={() => resolve.mutate(alert)}
                  disabled={resolve.isPending}
                >
                  Resolve
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {(truncated || alerts.length > SHOWN) && (
        <p className="hint">
          {truncated &&
            `Showing the first ${SHOWN} of ${alerts.length} open alert${
              alerts.length === 1 ? '' : 's'
            }. `}
          <Link to="/sessions">Sessions</Link>
        </p>
      )}
      {canManage && (
        <div className="row">
          <button
            type="button"
            onClick={() => scan.mutate()}
            disabled={scan.isPending}
          >
            {scan.isPending ? 'Scanning...' : 'Scan now'}
          </button>
          {scan.isSuccess && (
            <span className="success" role="status">
              {scan.data.raised === 0 && scan.data.resolved === 0
                ? 'Nothing to report — every past session has a record.'
                : `Raised ${scan.data.raised} alert${
                    scan.data.raised === 1 ? '' : 's'
                  }, resolved ${scan.data.resolved} alert${
                    scan.data.resolved === 1 ? '' : 's'
                  }.`}
            </span>
          )}
        </div>
      )}
      {(resolve.isError || scan.isError) && (
        <p className="error" role="alert">
          {(resolve.error ?? scan.error)?.message}
        </p>
      )}
    </section>
  );
}

export default SessionAlertsCard;
