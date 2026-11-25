export type DeliveryStatus = 'ACTIVE' | 'INACTIVE';

export interface Delivery {
  id: string;
  schoolId: string;
  course: {
    id: string;
    title: string;
  };
  label: string;
  academicYear: string;
  status: DeliveryStatus;
  displayName: string;
  subscriptionActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryListParams {
  page: number;
  limit: number;
  schoolId?: string;
  courseId?: string;
  academicYear?: string;
  status?: DeliveryStatus;
}
