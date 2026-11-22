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

export interface DeliveryTeacher {
  id: string;
  teacherId: string;
  name: string;
  steamxId: string;
  assignedAt: string;
  assignedBy: { id: string; name: string } | null;
  removedAt: string | null;
  removedBy: { id: string; name: string } | null;
}

export interface DeliveryTeacherListParams {
  deliveryId: string;
  page: number;
  limit: number;
}

export type DeliveryEnrollmentStatus = 'ACTIVE' | 'REMOVED' | 'COMPLETED';

export interface DeliveryEnrollment {
  id: string;
  studentId: string;
  name: string;
  steamxId: string;
  classSection: { id: string; className: string; sectionName: string };
  status: DeliveryEnrollmentStatus;
  enrolledAt: string;
  enrolledBy: { id: string; name: string } | null;
  endedAt: string | null;
  endedBy: { id: string; name: string } | null;
}

export interface DeliveryEnrollmentListParams {
  deliveryId: string;
  page: number;
  limit: number;
  status?: DeliveryEnrollmentStatus;
}

export interface EnrollDeliveryStudentsPayload {
  studentIds: string[];
}

export interface EnrollmentCounts {
  enrolled: number;
  reactivated: number;
  alreadyEnrolled: number;
}

export interface DeliveryListParams {
  page: number;
  limit: number;
  schoolId?: string;
  courseId?: string;
  academicYear?: string;
  status?: DeliveryStatus;
}

export interface CreateDeliveryPayload {
  schoolId: string;
  courseId: string;
  academicYear: string;
  label: string;
}

export interface UpdateDeliveryLabelPayload {
  label: string;
}
