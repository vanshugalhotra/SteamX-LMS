import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import type { Delivery, DeliveryEnrollment } from '../model/types';
import { DeliveryStudentsPanel } from './DeliveryStudentsPanel';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  enroll: vi.fn(),
  remove: vi.fn(),
  studentSearch: vi.fn(),
  toastSuccess: vi.fn(),
  enrollIsPending: false,
  enrollVariables: undefined as { deliveryId: string; body: { studentIds: string[] } } | undefined,
  removeIsPending: false,
  removeVariables: undefined as { deliveryId: string; studentId: string } | undefined,
}));

vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess } }));
vi.mock('../queries', () => ({
  useDeliveryEnrollments: mocks.list,
  useEnrollDeliveryStudents: () => ({
    mutateAsync: mocks.enroll,
    isPending: mocks.enrollIsPending,
    variables: mocks.enrollVariables,
  }),
  useRemoveDeliveryStudent: () => ({
    mutateAsync: mocks.remove,
    isPending: mocks.removeIsPending,
    variables: mocks.removeVariables,
  }),
}));
vi.mock('@/features/admin/users/queries', () => ({
  useActiveStudentSearch: mocks.studentSearch,
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

const enrollment = (
  status: DeliveryEnrollment['status'],
  studentId = 'student-id',
): DeliveryEnrollment => ({
  id: `enrollment-${status.toLowerCase()}`,
  studentId,
  name: `${status} student`,
  steamxId: `STU-${status}`,
  classSection: { id: 'class-id', className: 'Grade 5', sectionName: 'Blue' },
  status,
  enrolledAt: '2026-11-18T00:00:00.000Z',
  enrolledBy: null,
  endedAt: status === 'ACTIVE' ? null : '2026-11-19T00:00:00.000Z',
  endedBy: null,
});

const studentSearchOptions = [
  { value: 'student-ada', label: 'Ada Student', description: 'STU-001' },
  { value: 'student-bea', label: 'Bea Student', description: 'STU-002' },
  { value: 'active-student', label: 'Already Active', description: 'STU-003' },
];

let rows: DeliveryEnrollment[] = [];
let total = 0;

beforeEach(() => {
  vi.resetAllMocks();
  rows = [];
  total = 0;
  mocks.enrollIsPending = false;
  mocks.enrollVariables = undefined;
  mocks.removeIsPending = false;
  mocks.removeVariables = undefined;
  mocks.studentSearch.mockReturnValue({
    options: studentSearchOptions,
    isPending: false,
    isError: false,
  });
  mocks.list.mockImplementation((params: { page: number; limit: number }) => ({
    data: { items: rows, page: params.page, limit: params.limit, total },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }));
});

async function chooseStudent(user: ReturnType<typeof userEvent.setup>, optionName: string) {
  await user.click(screen.getByRole('combobox', { name: 'Search active students' }));
  await user.click(screen.getByRole('option', { name: optionName }));
}

describe('DeliveryStudentsPanel enrollment lifecycle', () => {
  it('searches in the delivery school and omits active students visible on the roster page', async () => {
    const user = userEvent.setup();
    rows = [enrollment('ACTIVE', 'active-student')];
    total = 1;
    render(<DeliveryStudentsPanel delivery={delivery} />);

    expect(mocks.studentSearch).toHaveBeenCalledWith('', 'school-id');
    await user.click(screen.getByRole('combobox', { name: 'Search active students' }));

    expect(screen.getByRole('option', { name: 'Ada Student STU-001' })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Already Active STU-003' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: 'Ada Student STU-001' }));
    expect(screen.getByRole('list', { name: 'Selected students' })).toHaveTextContent(
      'Ada Student',
    );
    expect(screen.getByText(/1 selected/)).toBeInTheDocument();
  });

  it('defaults to Active and sends selected status or an unfiltered All query', async () => {
    const user = userEvent.setup();
    total = 25;
    render(<DeliveryStudentsPanel delivery={delivery} />);

    expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true');
    expect(mocks.list).toHaveBeenLastCalledWith({
      deliveryId: 'delivery-id',
      page: 1,
      limit: 20,
      status: 'ACTIVE',
    });

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(mocks.list).toHaveBeenLastCalledWith({
      deliveryId: 'delivery-id',
      page: 2,
      limit: 20,
      status: 'ACTIVE',
    });

    await user.click(screen.getByRole('button', { name: 'Removed' }));
    expect(mocks.list).toHaveBeenLastCalledWith({
      deliveryId: 'delivery-id',
      page: 1,
      limit: 20,
      status: 'REMOVED',
    });

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(mocks.list).toHaveBeenLastCalledWith({
      deliveryId: 'delivery-id',
      page: 1,
      limit: 20,
      status: undefined,
    });
  });

  it('shows lifecycle statuses and offers reactivation for Removed and Completed', () => {
    rows = [
      enrollment('ACTIVE', 'active-student'),
      enrollment('REMOVED', 'removed-student'),
      enrollment('COMPLETED', 'completed-student'),
    ];
    total = rows.length;
    render(<DeliveryStudentsPanel delivery={delivery} />);

    expect(screen.getAllByText('Active')).toHaveLength(2);
    expect(screen.getAllByText('Removed')).toHaveLength(2);
    expect(screen.getAllByText('Completed')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Reactivate' })).toHaveLength(2);
    expect(screen.getByText("Completed enrollments can't be removed.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
    const completedRow = screen.getByText('COMPLETED student').closest('li');
    expect(completedRow).not.toBeNull();
    if (completedRow) {
      expect(
        within(completedRow).queryByRole('button', { name: 'Remove' }),
      ).not.toBeInTheDocument();
    }
  });

  it.each(['REMOVED', 'COMPLETED'] as const)(
    'reactivates a %s enrollment using its student ID and shows success feedback',
    async (status) => {
      const user = userEvent.setup();
      rows = [enrollment(status)];
      mocks.enroll.mockResolvedValue({ enrolled: 0, reactivated: 1, alreadyEnrolled: 0 });
      render(<DeliveryStudentsPanel delivery={delivery} />);

      await user.click(screen.getByRole('button', { name: 'Reactivate' }));

      await waitFor(() => {
        expect(mocks.enroll).toHaveBeenCalledWith({
          deliveryId: 'delivery-id',
          body: { studentIds: ['student-id'] },
        });
      });
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Student reactivated');
    },
  );

  it('submits all selected IDs, reports backend counts, and clears selections', async () => {
    const user = userEvent.setup();
    mocks.enroll.mockResolvedValue({ enrolled: 1, reactivated: 1, alreadyEnrolled: 2 });
    render(<DeliveryStudentsPanel delivery={delivery} />);

    await chooseStudent(user, 'Ada Student STU-001');
    await chooseStudent(user, 'Bea Student STU-002');
    expect(screen.getByText(/2 selected/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enroll 2 students' }));

    await waitFor(() => {
      expect(mocks.enroll).toHaveBeenCalledWith({
        deliveryId: 'delivery-id',
        body: { studentIds: ['student-ada', 'student-bea'] },
      });
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Enrollment results: 1 enrolled, 1 reactivated, 2 already enrolled',
    );
    expect(screen.queryByRole('list', { name: 'Selected students' })).not.toBeInTheDocument();
    expect(screen.getByText(/0 selected/)).toBeInTheDocument();
  });

  it('rejects empty submissions and keeps selected students after an error', async () => {
    const user = userEvent.setup();
    mocks.enroll.mockRejectedValue(
      new ApiError(409, 'Delivery is inactive', { code: 'DELIVERY_NOT_ACTIVE' }),
    );
    render(<DeliveryStudentsPanel delivery={delivery} />);

    expect(screen.getByRole('button', { name: 'Enroll students' })).toBeDisabled();
    await chooseStudent(user, 'Ada Student STU-001');
    await user.click(screen.getByRole('button', { name: 'Enroll 1 student' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This delivery is inactive.');
    expect(screen.getByRole('list', { name: 'Selected students' })).toHaveTextContent(
      'Ada Student',
    );
  });

  it('shows a loading label and disables batch controls while enrolling', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DeliveryStudentsPanel delivery={delivery} />);
    await chooseStudent(user, 'Ada Student STU-001');
    mocks.enrollIsPending = true;
    mocks.enrollVariables = {
      deliveryId: 'delivery-id',
      body: { studentIds: ['student-ada'] },
    };
    rerender(<DeliveryStudentsPanel delivery={delivery} />);

    expect(screen.getByRole('button', { name: 'Enrolling…' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Search active students' })).toBeDisabled();
  });

  it('disables batch enrollment when delivery or subscription eligibility blocks it', () => {
    const { rerender } = render(
      <DeliveryStudentsPanel delivery={{ ...delivery, status: 'INACTIVE' }} />,
    );
    expect(screen.getByRole('button', { name: 'Enroll students' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Search active students' })).toBeDisabled();

    rerender(<DeliveryStudentsPanel delivery={{ ...delivery, subscriptionActive: false }} />);
    expect(screen.getByRole('button', { name: 'Enroll students' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Search active students' })).toBeDisabled();
  });

  it('shows a loading label and disables reactivation while the request is pending', () => {
    rows = [enrollment('REMOVED')];
    mocks.enrollIsPending = true;
    mocks.enrollVariables = { deliveryId: 'delivery-id', body: { studentIds: ['student-id'] } };
    render(<DeliveryStudentsPanel delivery={delivery} />);

    expect(screen.getByRole('button', { name: 'Reactivating…' })).toBeDisabled();
  });

  it('disables reactivation when delivery enrollment writes are blocked', () => {
    rows = [enrollment('REMOVED')];
    const { rerender } = render(
      <DeliveryStudentsPanel delivery={{ ...delivery, status: 'INACTIVE' }} />,
    );

    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeDisabled();

    rerender(<DeliveryStudentsPanel delivery={{ ...delivery, subscriptionActive: false }} />);
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeDisabled();
  });

  it('shows reactivation errors to the user', async () => {
    const user = userEvent.setup();
    rows = [enrollment('COMPLETED')];
    mocks.enroll.mockRejectedValue(
      new ApiError(409, 'Delivery is inactive', { code: 'DELIVERY_NOT_ACTIVE' }),
    );
    render(<DeliveryStudentsPanel delivery={delivery} />);

    await user.click(screen.getByRole('button', { name: 'Reactivate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This delivery is inactive.');
  });
});
