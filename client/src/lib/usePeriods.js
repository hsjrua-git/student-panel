import { useQuery } from '@tanstack/react-query';
import { getPeriods } from '../api/periods.js';

export function usePeriods() {
  // The period calendar is derived from a single anchor date and effectively
  // never changes during a session, so keep it fresh for much longer than the
  // global default to avoid refetching it on every page that needs it
  // (Dashboard, Results, Evaluate). Editing the anchor invalidates ['periods'].
  return useQuery({
    queryKey: ['periods'],
    queryFn: getPeriods,
    staleTime: 30 * 60_000,
  });
}