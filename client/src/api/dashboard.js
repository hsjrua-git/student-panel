// Dashboard api — on-device adapter over the dashboard service (was fetch to
// /api/dashboard/trends). Same return shape as before (the bare trends array).

import { callService } from './local.js';
import { getTrends as getTrendsService } from '@server/core/services/dashboard.js';

export async function getTrends(groupId = null) {
  const { trends } = await callService(() =>
    getTrendsService({ groupId: groupId ?? undefined }),
  );
  return trends;
}
