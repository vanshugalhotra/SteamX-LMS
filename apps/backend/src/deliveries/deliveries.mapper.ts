import type { DeliveryRecord } from './deliveries.repository.js';
import type { DeliveryEnrollmentRecord } from './enrollments/delivery-enrollments.repository.js';
import type { DeliveryTeacherRecord } from './delivery-teacher/delivery-teachers.repository.js';
import type { DeliveryResponseDto } from './dto/delivery-response.dto.js';
import type { DeliveryTeacherResponseDto } from './dto/delivery-teacher-response.dto.js';
import type { DeliveryEnrollmentResponseDto } from './enrollments/dto/delivery-enrollment-response.dto.js';

/**
 * Builds the delivery response, including a display name and subscription-state snapshot.
 * @param delivery Stored delivery and selected course/class-section fields.
 * @param subscriptionActive Current access state for this school-course pair.
 * @returns The public delivery response.
 */
export function toDeliveryResponse(
  delivery: DeliveryRecord,
  subscriptionActive: boolean,
): DeliveryResponseDto {
  return {
    id: delivery.id,
    schoolId: delivery.schoolId,
    course: delivery.course,
    classSection: delivery.classSection,
    academicYear: delivery.academicYear,
    status: delivery.status,
    displayName: `${delivery.course.title} - ${delivery.classSection.className} ${delivery.classSection.sectionName} - ${delivery.academicYear}`,
    subscriptionActive,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
  };
}

/**
 * Shapes one teacher assignment for the delivery teacher API.
 * @param assignment Stored assignment with teacher and actor display fields.
 * @returns The public teacher assignment response.
 */
export function toDeliveryTeacherResponse(
  assignment: DeliveryTeacherRecord,
): DeliveryTeacherResponseDto {
  return {
    id: assignment.id,
    teacherId: assignment.teacherId,
    name: assignment.teacher.user.name,
    steamxId: assignment.teacher.user.steamxId,
    assignedAt: assignment.assignedAt,
    assignedBy: assignment.assignedBy,
    removedAt: assignment.removedAt,
    removedBy: assignment.removedBy,
  };
}

/** Shapes an enrollment and its related student fields for the delivery enrollment API. */
export function toDeliveryEnrollmentResponse(
  enrollment: DeliveryEnrollmentRecord,
): DeliveryEnrollmentResponseDto {
  return {
    id: enrollment.id,
    studentId: enrollment.studentId,
    name: enrollment.student.user.name,
    steamxId: enrollment.student.user.steamxId,
    classSection: enrollment.student.classSection,
    status: enrollment.status,
    enrolledAt: enrollment.enrolledAt,
    enrolledBy: enrollment.enrolledBy,
    endedAt: enrollment.endedAt,
    endedBy: enrollment.endedBy,
  };
}
