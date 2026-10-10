import { useQuery } from '@tanstack/react-query';
import { listPeriods } from '../api/periods.js';

// The list of named, dated periods. Periods change rarely during a session, so
// keep it fresh far longer than the global default to avoid refetching on every
// page that needs it (Dashboard, Results, Evaluate). Mutations on the Periods
// page invalidate ['periods'].
export function usePeriods({ includeArchived = false } = {}) {
  return useQuery({
    queryKey: ['periods', { includeArchived }],
    queryFn: () => listPeriods({ includeArchived }),
    staleTime: 30 * 60_000,
  });
}
