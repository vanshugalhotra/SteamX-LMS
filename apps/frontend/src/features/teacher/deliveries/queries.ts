import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchAllTeacherDeliveries, fetchTeacherDeliveries } from './api/api';
import type { DeliveryStatus } from '@/features/deliveries/model/types';
import type { TeacherDeliveryListParams } from './model/types';

export const teacherDeliveryKeys = {
  all: ['teacher-deliveries'] as const,
  list: (params: TeacherDeliveryListParams) =>
    [...teacherDeliveryKeys.all, 'list', params] as const,
  search: (status: DeliveryStatus | undefined) =>
    [...teacherDeliveryKeys.all, 'search', status ?? 'ALL'] as const,
};

export function useTeacherDeliveries(params: TeacherDeliveryListParams, enabled = true) {
  return useQuery({
    queryKey: teacherDeliveryKeys.list(params),
    queryFn: () => fetchTeacherDeliveries(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useTeacherDeliverySearch(status: DeliveryStatus | undefined, enabled: boolean) {
  return useQuery({
    queryKey: teacherDeliveryKeys.search(status),
    queryFn: () => fetchAllTeacherDeliveries(status),
    enabled,
  });
}
