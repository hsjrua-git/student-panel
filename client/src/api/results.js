// Results api — on-device adapter over the results service (was fetch to
// /api/results). Same return shape as before (the full results object).

import { callService } from './local.js';
import { getResults as getResultsService } from '@server/core/services/results.js';

export function getResults(periodNumber, groupId = null) {
  return callService(() =>
    getResultsService({ periodNumber, groupId: groupId ?? undefined }),
  );
}
