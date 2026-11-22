import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Delivery } from '../model/types';
import { DeliveryStudentsPanel } from './DeliveryStudentsPanel';
import { DeliveryTeachersPanel } from './DeliveryTeachersPanel';

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
vi.mock('../queries', () => ({
  useDeliveryTeachers: () => ({
    data: { items: [], page: 1, limit: 20, total: 0 },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAssignDeliveryTeacher: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveDeliveryTeacher: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    variables: undefined,
  }),
  useDeliveryEnrollments: () => ({
    data: { items: [], page: 1, limit: 20, total: 0 },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useEnrollDeliveryStudents: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveDeliveryStudent: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    variables: undefined,
  }),
}));
vi.mock('@/features/admin/users/queries', () => ({
  useActiveTeacherSearch: () => ({ options: [], isPending: false, isError: false }),
  useActiveStudentSearch: () => ({ options: [], isPending: false, isError: false }),
}));

const delivery: Delivery = {
  id: 'delivery-id',
  schoolId: 'school-id',
  course: { id: 'course-id', title: 'Robotics' },
  label: 'Grade 5 Blue',
  academicYear: '2026-27',
  status: 'ACTIVE',
  displayName: 'Robotics - Grade 5 Blue - 2026-27',
  subscriptionActive: true,
  createdAt: '2026-11-18T00:00:00.000Z',
  updatedAt: '2026-11-18T00:00:00.000Z',
};

describe('delivery management panels', () => {
  it('prevents teacher assignment when the delivery is inactive', () => {
    render(<DeliveryTeachersPanel delivery={{ ...delivery, status: 'INACTIVE' }} />);

    expect(
      screen.queryByRole('combobox', { name: 'Search active teachers' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Inactive deliveries can't take new teachers.")).toBeInTheDocument();
  });

  it('prevents student enrollment when the subscription is inactive', () => {
    render(<DeliveryStudentsPanel delivery={{ ...delivery, subscriptionActive: false }} />);

    expect(screen.getByRole('combobox', { name: 'Search active students' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enroll student' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('subscription');
  });
});
