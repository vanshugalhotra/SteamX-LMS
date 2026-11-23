import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import {
  buildDeliveryListSearchParams,
  assignDeliveryTeacher,
  createDelivery,
  enrollDeliveryStudents,
  fetchDeliveries,
  fetchDelivery,
  fetchDeliveryEnrollments,
  fetchDeliveryTeachers,
  removeDeliveryStudent,
  removeDeliveryTeacher,
  updateDeliveryLabel,
  updateDeliveryStatus,
} from './api';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
const mockedApiFetch = vi.mocked(apiFetch);

beforeEach(() => mockedApiFetch.mockReset());

describe('delivery API', () => {
  it('omits empty filters and serializes supported filters', () => {
    expect(buildDeliveryListSearchParams({ page: 1, limit: 20 }).toString()).toBe(
      'page=1&limit=20',
    );
    expect(
      buildDeliveryListSearchParams({
        page: 2,
        limit: 10,
        schoolId: 'school-id',
        courseId: 'course-id',
        academicYear: '2026-27',
        status: 'ACTIVE',
      }).toString(),
    ).toBe(
      'page=2&limit=10&schoolId=school-id&courseId=course-id&academicYear=2026-27&status=ACTIVE',
    );
  });

  it('calls list, detail, create, rename, and status endpoints', async () => {
    const payload = {
      schoolId: 'school-id',
      courseId: 'course-id',
      academicYear: '2026-27',
      label: 'Grade 5 Blue',
    };
    await fetchDeliveries({ page: 1, limit: 20, schoolId: 'school-id' });
    await fetchDelivery('delivery-id');
    await createDelivery(payload);
    await updateDeliveryLabel('delivery-id', { label: 'Grade 5 Green' });
    await updateDeliveryStatus('delivery-id', 'INACTIVE');

    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      1,
      '/deliveries?page=1&limit=20&schoolId=school-id',
    );
    expect(mockedApiFetch).toHaveBeenNthCalledWith(2, '/deliveries/delivery-id');
    expect(mockedApiFetch).toHaveBeenNthCalledWith(3, '/deliveries', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    expect(mockedApiFetch).toHaveBeenNthCalledWith(4, '/deliveries/delivery-id', {
      method: 'PATCH',
      body: JSON.stringify({ label: 'Grade 5 Green' }),
    });
    expect(mockedApiFetch).toHaveBeenNthCalledWith(5, '/deliveries/delivery-id/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'INACTIVE' }),
    });
  });

  it('lists, assigns, and removes teachers from a delivery', async () => {
    await fetchDeliveryTeachers({
      deliveryId: 'delivery-id',
      page: 2,
      limit: 20,
    });
    await assignDeliveryTeacher('delivery-id', 'teacher-id');
    await removeDeliveryTeacher('delivery-id', 'teacher-id');

    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      1,
      '/deliveries/delivery-id/teachers?page=2&limit=20',
    );
    expect(mockedApiFetch).toHaveBeenNthCalledWith(2, '/deliveries/delivery-id/teachers', {
      method: 'POST',
      body: JSON.stringify({ teacherId: 'teacher-id' }),
    });
    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      3,
      '/deliveries/delivery-id/teachers/teacher-id',
      { method: 'DELETE' },
    );
  });

  it('lists, enrolls, and removes students from a delivery', async () => {
    await fetchDeliveryEnrollments({
      deliveryId: 'delivery-id',
      page: 1,
      limit: 20,
      status: 'ACTIVE',
    });
    await enrollDeliveryStudents('delivery-id', {
      studentIds: ['student-id', 'another-student-id'],
    });
    await removeDeliveryStudent('delivery-id', 'student-id');

    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      1,
      '/deliveries/delivery-id/enrollments?page=1&limit=20&status=ACTIVE',
    );
    expect(mockedApiFetch).toHaveBeenNthCalledWith(2, '/deliveries/delivery-id/enrollments', {
      method: 'POST',
      body: JSON.stringify({ studentIds: ['student-id', 'another-student-id'] }),
    });
    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      3,
      '/deliveries/delivery-id/enrollments/student-id',
      { method: 'DELETE' },
    );
  });

  it('omits the status query when listing all enrollments', async () => {
    await fetchDeliveryEnrollments({ deliveryId: 'delivery-id', page: 1, limit: 20 });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/deliveries/delivery-id/enrollments?page=1&limit=20',
    );
  });
});
