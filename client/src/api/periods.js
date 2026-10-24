// Periods api — on-device adapter over the periods service (was fetch to
// /api/periods and /api/settings/period-anchor). Same return shapes as before.

import { callService } from './local.js';
import {
  listPeriods,
  setPeriodAnchor as setPeriodAnchorService,
} from '@server/core/services/periods.js';

export function getPeriods() {
  return callService(() => listPeriods());
}

export function setPeriodAnchor(anchorDate) {
  return callService(() => setPeriodAnchorService(anchorDate));
}
