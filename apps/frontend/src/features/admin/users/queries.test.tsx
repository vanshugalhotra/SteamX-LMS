import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchUsers } from './api/api';
import type { UserListItem } from './model/types';
import { useActiveStudentSearch } from './queries';

vi.mock('./api/api', () => ({
  createStudent: vi.fn(),
  createTeacher: vi.fn(),
  fetchUser: vi.fn(),
  fetchUsers: vi.fn(),
  updateUser: vi.fn(),
  updateUserStatus: vi.fn(),
}));

const mockedFetchUsers = vi.mocked(fetchUsers);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

const student: UserListItem = {
  id: 'student-id',
  steamxId: 'STU-001',
  name: 'Ada Student',
  email: null,
  status: 'ACTIVE',
  role: { key: 'student', name: 'Student' },
  userType: 'STUDENT',
  schoolId: 'school-id',
  createdAt: '2026-11-18T00:00:00.000Z',
};

beforeEach(() => vi.resetAllMocks());

describe('active student search', () => {
  it('searches active students by query and delivery school', async () => {
    mockedFetchUsers.mockResolvedValue({ items: [student], page: 1, limit: 20, total: 1 });
    const Wrapper = createWrapper();
    const { result } = renderHook(() => useActiveStudentSearch('Ada', 'school-id'), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(mockedFetchUsers).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        q: 'Ada',
        role: 'student',
        status: 'ACTIVE',
        schoolId: 'school-id',
      });
    });
    await waitFor(() => {
      expect(result.current.options).toEqual([
        { value: 'student-id', label: 'Ada Student', description: 'STU-001' },
      ]);
    });
  });

  it('does not search without a school context', () => {
    const Wrapper = createWrapper();
    const { result } = renderHook(() => useActiveStudentSearch('', ''), { wrapper: Wrapper });

    expect(result.current.options).toEqual([]);
    expect(mockedFetchUsers).not.toHaveBeenCalled();
  });
});
