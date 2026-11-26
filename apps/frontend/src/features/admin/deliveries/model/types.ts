export type {
  Delivery,
  DeliveryListParams,
  DeliveryStatus,
} from '@/features/deliveries/model/types';

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

export interface CreateDeliveryPayload {
  schoolId: string;
  courseId: string;
  academicYear: string;
  label: string;
}

export interface UpdateDeliveryLabelPayload {
  label: string;
}

export type {
  LessonReleaseResponse,
  ModuleReleaseResponse,
  ModuleReleaseState,
  ReleaseLesson,
  ReleaseModule,
  ReleaseOutlineResponse,
} from '@/features/deliveries/model/types';
