import { useQuery } from '@tanstack/react-query';
import { getPeriods } from '../api/periods.js';

export function usePeriods() {
  return useQuery({ queryKey: ['periods'], queryFn: getPeriods });
}