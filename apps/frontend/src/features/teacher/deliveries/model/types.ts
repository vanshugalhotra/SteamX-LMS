import type { Delivery, DeliveryStatus } from '@/features/deliveries/model/types';

export type TeacherDelivery = Delivery;

export interface TeacherDeliveryListParams {
  page: number;
  limit: number;
  status?: DeliveryStatus;
}
