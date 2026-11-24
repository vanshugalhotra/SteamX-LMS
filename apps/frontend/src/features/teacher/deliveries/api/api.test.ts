import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDeliveries } from '@/features/deliveries/api/api';
import type { TeacherDelivery } from '../model/types';
import { fetchAllTeacherDeliveries, fetchTeacherDeliveries } from './api';

vi.mock('@/features/deliveries/api/api', () => ({ fetchDeliveries: vi.fn() }));
const mockedFetchDeliveries = vi.mocked(fetchDeliveries);

const delivery: TeacherDelivery = {
  id: 'delivery-1',
  schoolId: 'school-1',
  course: { id: 'course-1', title: 'Robotics' },
  label: 'Grade 5 Blue',
  academicYear: '2026-27',
  status: 'INACTIVE',
  displayName: 'Robotics - Grade 5 Blue - 2026-27',
  subscriptionActive: false,
  createdAt: '2026-11-18T00:00:00.000Z',
  updatedAt: '2026-11-18T00:00:00.000Z',
};

beforeEach(() => mockedFetchDeliveries.mockReset());

describe('teacher deliveries API', () => {
  it('uses the shared delivery API without sending school or course filters', async () => {
    await fetchTeacherDeliveries({ page: 2, limit: 20 });

    expect(mockedFetchDeliveries).toHaveBeenCalledWith({ page: 2, limit: 20 });
  });

  it('loads every server-scoped page used by search', async () => {
    mockedFetchDeliveries
      .mockResolvedValueOnce({
        items: [delivery],
        page: 1,
        limit: 100,
        total: 101,
      })
      .mockResolvedValueOnce({
        items: [{ ...delivery, id: 'delivery-2' }],
        page: 2,
        limit: 100,
        total: 101,
      });

    await expect(fetchAllTeacherDeliveries('INACTIVE')).resolves.toEqual([
      delivery,
      { ...delivery, id: 'delivery-2' },
    ]);

    expect(mockedFetchDeliveries).toHaveBeenNthCalledWith(1, {
      page: 1,
      limit: 100,
      status: 'INACTIVE',
    });
    expect(mockedFetchDeliveries).toHaveBeenNthCalledWith(2, {
      page: 2,
      limit: 100,
      status: 'INACTIVE',
    });
  });
});
