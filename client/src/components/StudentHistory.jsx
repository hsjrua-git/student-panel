import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { listEvaluations } from '../api/evaluations.js';
import { studentHistoryCsvRows } from '../lib/exports.js';
import { visibleParameters } from '../lib/prefs.js';
import { formatParameterHint } from '../lib/format.js';
import { usePreferences } from '../preferences/PreferencesContext.jsx';
import ExportButton from './ExportButton.jsx';
import { LockIcon, NoteFilledIcon } from './icons.jsx';

// One student's recorded scores across every group they belong to. Scores are
// kept per group, so this fetches each group's rows for this student (via
// useQueries, which handles the dynamic group count) and renders one compact
// table per group: rows are the leaf parameters that carry a score, columns are
// the periods that carry a score, in the app's parameter/period order.
export default function StudentHistory({ student, groups, periods, parameters }) {
  const { preferences } = usePreferences();

  const leafParameters = useMemo(
    () =>
      visibleParameters(
        parameters.filter((parameter) => parameter.isLeaf),
        preferences.hiddenParameterIds,
      ),
    [parameters, preferences.hiddenParameterIds],
  );

  const results = useQueries({
    queries: groups.map((group) => ({
      queryKey: ['evaluations', { groupId: group.id, studentId: student.id }],
      queryFn: () =>
        listEvaluations({ groupId: group.id, studentId: student.id }),
    })),
  });

  const evaluationsByGroup = useMemo(() => {
    const out = {};
    groups.forEach((group, index) => {
      out[group.id] = results[index]?.data ?? [];
    });
    return out;
  }, [groups, results]);

  const pending = results.some((result) => result.isPending);
  const failed = results.find((result) => result.isError);
  const anyScores = Object.values(evaluationsByGroup).some((rows) =>
    rows.some((row) => row.value !== null && row.value !== undefined),
  );

  if (groups.length === 0) {
    return (
      <p className="hint">
        This student is not in any group yet, so there are no scores to show.
        Scores are kept per group.
      </p>
    );
  }

  return (
    <>
      <div className="control-bar">
        <span className="spacer" />
        <ExportButton
          label="Export history (CSV)"
          filename={`history-${student.studentCode}.csv`}
          disabled={pending || !anyScores}
          buildRows={() =>
            studentHistoryCsvRows({
              groups,
              evaluationsByGroup,
              periods,
              parameters,
            })
          }
        />
      </div>

      {pending && <p className="hint">Loading…</p>}
      {failed && <p className="error">{failed.error.message}</p>}

      {!pending &&
        !failed &&
        groups.map((group) => (
          <GroupHistory
            key={group.id}
            group={group}
            rows={evaluationsByGroup[group.id] ?? []}
            periods={periods}
            leafParameters={leafParameters}
          />
        ))}
    </>
  );
}

// One group's slice of the history: only the periods and leaf parameters that
// actually carry a score for this student in this group are shown.
function GroupHistory({ group, rows, periods, leafParameters }) {
  const scored = rows.filter(
    (row) => row.value !== null && row.value !== undefined,
  );
  const byCell = new Map(
    scored.map((row) => [`${row.parameterId}:${row.periodId}`, row]),
  );

  const presentPeriodIds = new Set(scored.map((row) => row.periodId));
  const presentParameterIds = new Set(scored.map((row) => row.parameterId));
  const shownPeriods = periods.filter((period) =>
    presentPeriodIds.has(period.id),
  );
  const shownParameters = leafParameters.filter((parameter) =>
    presentParameterIds.has(parameter.id),
  );

  return (
    <section className="section-card subtle">
      <h3>{group.name}</h3>
      {scored.length === 0 ? (
        <p className="hint">No scores recorded for this group yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Parameter</th>
                {shownPeriods.map((period) => (
                  <th key={period.id}>{period.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownParameters.map((parameter) => (
                <tr key={parameter.id}>
                  <th scope="row" className="row-head">
                    {parameter.name}
                    {formatParameterHint(parameter) && (
                      <div className="hint">
                        {formatParameterHint(parameter)}
                      </div>
                    )}
                  </th>
                  {shownPeriods.map((period) => {
                    const cell = byCell.get(`${parameter.id}:${period.id}`);
                    if (!cell) {
                      return (
                        <td key={period.id} className="muted">
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={period.id}>
                        <span className="cell-value">{cell.value}</span>
                        {cell.isLocked && (
                          <span className="lock" aria-label="Locked">
                            <LockIcon />
                          </span>
                        )}
                        {cell.comment && (
                          <span
                            className="note-mark"
                            title={cell.comment}
                            aria-label={`Note: ${cell.comment}`}
                          >
                            <NoteFilledIcon />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
