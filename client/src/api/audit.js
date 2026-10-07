// Audit api — on-device adapter over the audit service (was fetch to
// /api/audit). Same return shape as before (the raw paginated result).
// Empty category/actor become undefined so the service skips those filters
// (it validates non-empty values against its whitelist).

import { callService } from './local.js';
import { getAuditEntries } from '@server/core/services/audit.js';

export function listAudit({ category = '', actor = '', page = 1 } = {}) {
  return callService(() =>
    getAuditEntries({
      category: category || undefined,
      actor: actor || undefined,
      page,
    }),
  );
}
