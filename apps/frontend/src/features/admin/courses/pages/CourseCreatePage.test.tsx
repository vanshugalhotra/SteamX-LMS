import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATHS } from '@/lib/paths';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('react-router', () => ({ useNavigate: () => navigate }));
vi.mock('../components/CourseFormLayout', () => ({
  CourseFormLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/CourseForm', () => ({
  CourseForm: ({
    onDone,
    onCancel,
  }: {
    onDone: (courseId?: string) => void;
    onCancel: () => void;
  }) => (
    <>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        onClick={() => {
          onDone('course-1');
        }}
      >
        Course created
      </button>
    </>
  ),
}));

import { CourseCreatePage } from './CourseCreatePage';

describe('CourseCreatePage', () => {
  beforeEach(() => {
    navigate.mockReset();
  });

  it('returns to the course list when cancelled', async () => {
    const user = userEvent.setup();
    render(<CourseCreatePage />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(navigate).toHaveBeenCalledWith(PATHS.admin.courses);
  });

  it('opens the created course after successful creation', async () => {
    const user = userEvent.setup();
    render(<CourseCreatePage />);

    await user.click(screen.getByRole('button', { name: 'Course created' }));

    expect(navigate).toHaveBeenCalledWith(PATHS.admin.courseEdit('course-1'));
  });
});
