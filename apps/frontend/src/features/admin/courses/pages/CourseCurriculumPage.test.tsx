import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { PATHS } from '@/lib/paths';
import type { CourseOutline } from '../model/types';

const {
  useCourseOutlineMock,
  updateStatusMutateAsync,
  createModuleMutateAsync,
  updateModuleMutateAsync,
  updateModuleStatusMutateAsync,
  reorderModulesMutateAsync,
  toastSuccess,
} = vi.hoisted(() => ({
  useCourseOutlineMock: vi.fn(),
  updateStatusMutateAsync: vi.fn(),
  createModuleMutateAsync: vi.fn(),
  updateModuleMutateAsync: vi.fn(),
  updateModuleStatusMutateAsync: vi.fn(),
  reorderModulesMutateAsync: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('../queries', () => ({
  useCourseOutline: useCourseOutlineMock,
  useUpdateCourseStatus: () => ({ mutateAsync: updateStatusMutateAsync, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: toastSuccess } }));
vi.mock('@/features/admin/modules/queries', () => ({
  useCreateCourseModule: () => ({ mutateAsync: createModuleMutateAsync, isPending: false }),
  useUpdateCourseModule: () => ({ mutateAsync: updateModuleMutateAsync, isPending: false }),
  useUpdateCourseModuleStatus: () => ({
    mutateAsync: updateModuleStatusMutateAsync,
    isPending: false,
  }),
  useReorderCourseModules: () => ({ mutateAsync: reorderModulesMutateAsync, isPending: false }),
}));
vi.mock('@/components/ui/confirm-dialog', async () => {
  const { ConfirmDialogMock } = await import('@/test/mocks/confirm-dialog');
  return { ConfirmDialog: ConfirmDialogMock };
});

import { CourseCurriculumPage } from './CourseCurriculumPage';

const outline: CourseOutline = {
  course: {
    id: 'course-1',
    title: 'Science Grade 6',
    description: 'Plants, matter, forces and energy.',
    status: 'ACTIVE',
  },
  modules: [
    {
      id: 'module-1',
      title: 'Plants & Energy',
      position: 1,
      status: 'ACTIVE',
      lessons: [
        {
          id: 'lesson-1',
          title: 'How plants make food',
          position: 1,
          status: 'ACTIVE',
          audience: 'STUDENT',
        },
        {
          id: 'lesson-2',
          title: 'Teaching notes: lab setup',
          position: 2,
          status: 'DRAFT',
          audience: 'TEACHER_ONLY',
        },
      ],
    },
  ],
};

interface OutlineQueryResult {
  data?: CourseOutline;
  error?: unknown;
  isPending: boolean;
  isError: boolean;
  refetch: ReturnType<typeof vi.fn>;
}

function mockOutline(overrides: Partial<OutlineQueryResult> = {}) {
  const result: OutlineQueryResult = {
    data: outline,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  };
  useCourseOutlineMock.mockReturnValue(result);
  return result;
}

function pageElement() {
  return (
    <MemoryRouter initialEntries={[PATHS.admin.courseCurriculum('course-1')]}>
      <Routes>
        <Route path={PATHS.admin.courseCurriculum(':id')} element={<CourseCurriculumPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderPage() {
  return render(pageElement());
}

describe('CourseCurriculumPage', () => {
  beforeEach(() => {
    useCourseOutlineMock.mockReset();
    updateStatusMutateAsync.mockReset();
    createModuleMutateAsync.mockReset();
    updateModuleMutateAsync.mockReset();
    updateModuleStatusMutateAsync.mockReset();
    reorderModulesMutateAsync.mockReset();
    toastSuccess.mockReset();
  });

  it('shows course summary, ordered modules, lessons, and audience', () => {
    mockOutline();

    renderPage();

    expect(screen.getByRole('heading', { name: 'Science Grade 6' })).toBeInTheDocument();
    expect(screen.getByText('Modules', { selector: 'dt' }).nextElementSibling).toHaveTextContent(
      '1',
    );
    expect(screen.getByText('Lessons', { selector: 'dt' }).nextElementSibling).toHaveTextContent(
      '2',
    );
    expect(screen.getByText('How plants make food')).toBeInTheDocument();
    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText('Teachers only')).toBeInTheDocument();
  });

  it('shows a note when the course is a draft', () => {
    mockOutline({
      data: {
        ...outline,
        course: { ...outline.course, status: 'DRAFT' },
      },
    });

    renderPage();

    expect(screen.getByRole('note')).toHaveTextContent(
      'Students can’t see its content until it’s active.',
    );
  });

  it('uses the description placeholder when the course description is empty', () => {
    mockOutline({
      data: {
        ...outline,
        course: { ...outline.course, description: '' },
      },
    });

    renderPage();

    expect(screen.getByText('No description yet.')).toBeInTheDocument();
  });

  it('confirms before archiving the course from the curriculum page', async () => {
    const user = userEvent.setup();
    mockOutline();
    updateStatusMutateAsync.mockResolvedValue({ ...outline.course, status: 'ARCHIVED' });

    renderPage();
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    await user.click(screen.getByRole('button', { name: 'Confirm Archive' }));

    expect(updateStatusMutateAsync).toHaveBeenCalledWith({
      id: 'course-1',
      status: 'ARCHIVED',
    });
  });

  it('collapses and expands all modules', async () => {
    const user = userEvent.setup();
    mockOutline();

    renderPage();

    const collapseButton = screen.getByRole('button', { name: 'Collapse all' });
    expect(collapseButton).toBeEnabled();
    await user.click(collapseButton);
    expect(screen.getByText('How plants make food')).not.toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByText('How plants make food')).toBeInTheDocument();
  });

  it('shows an empty state when the course has no modules', () => {
    mockOutline({ data: { ...outline, modules: [] } });

    renderPage();

    expect(screen.getByText('No modules yet')).toBeInTheDocument();
    expect(screen.getByText('Modules', { selector: 'dt' }).nextElementSibling).toHaveTextContent(
      '0',
    );
    expect(screen.getByText('Lessons', { selector: 'dt' }).nextElementSibling).toHaveTextContent(
      '0',
    );
  });

  it('creates a module with a trimmed title', async () => {
    const user = userEvent.setup();
    mockOutline({ data: { ...outline, modules: [] } });
    createModuleMutateAsync.mockResolvedValue({});

    renderPage();
    await user.click(screen.getByRole('button', { name: 'Add module' }));
    await user.type(screen.getByRole('textbox', { name: 'Title' }), '  Matter  ');
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Add module' }),
    );

    expect(createModuleMutateAsync).toHaveBeenCalledWith({
      courseId: 'course-1',
      body: { title: 'Matter' },
    });
  });

  it('validates an empty module title before calling the API', async () => {
    const user = userEvent.setup();
    mockOutline({ data: { ...outline, modules: [] } });

    renderPage();
    await user.click(screen.getByRole('button', { name: 'Add module' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Add module' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a module title.');
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute('aria-invalid', 'true');
    expect(createModuleMutateAsync).not.toHaveBeenCalled();
  });

  it('shows API errors in the module form without closing it', async () => {
    const user = userEvent.setup();
    mockOutline({ data: { ...outline, modules: [] } });
    createModuleMutateAsync.mockRejectedValue(new Error('Request failed'));

    renderPage();
    await user.click(screen.getByRole('button', { name: 'Add module' }));
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Matter');
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Add module' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('edits a module title', async () => {
    const user = userEvent.setup();
    mockOutline();
    updateModuleMutateAsync.mockResolvedValue({});

    renderPage();
    await user.click(screen.getByRole('button', { name: 'Actions for module Plants & Energy' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit module' }));
    const titleInput = screen.getByRole('textbox', { name: 'Title' });
    await user.clear(titleInput);
    await user.type(titleInput, 'Plant Science');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(updateModuleMutateAsync).toHaveBeenCalledWith({
      id: 'module-1',
      body: { title: 'Plant Science' },
    });
  });

  it('reorders modules using the complete module order', async () => {
    const user = userEvent.setup();
    const twoModuleOutline: CourseOutline = {
      ...outline,
      modules: [
        ...outline.modules,
        { id: 'module-2', title: 'Matter', position: 2, status: 'DRAFT', lessons: [] },
      ],
    };
    mockOutline({ data: twoModuleOutline });
    reorderModulesMutateAsync.mockResolvedValue([]);

    renderPage();
    await user.click(screen.getByRole('button', { name: 'Actions for module Plants & Energy' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move down' }));

    expect(reorderModulesMutateAsync).toHaveBeenCalledWith({
      courseId: 'course-1',
      body: { moduleIds: ['module-2', 'module-1'] },
    });
  });

  it('confirms before archiving a module', async () => {
    const user = userEvent.setup();
    mockOutline();
    updateModuleStatusMutateAsync.mockResolvedValue({});

    renderPage();
    await user.click(screen.getByRole('button', { name: 'Actions for module Plants & Energy' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive module' }));
    expect(screen.getByText(/and its active lessons will be archived/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm Archive module' }));

    expect(updateModuleStatusMutateAsync).toHaveBeenCalledWith({
      id: 'module-1',
      status: 'ARCHIVED',
    });
  });

  it('shows a loading state while the outline is loading', () => {
    mockOutline({ data: undefined, isPending: true });

    renderPage();

    expect(screen.getByRole('status', { name: 'Loading course curriculum' })).toBeInTheDocument();
  });

  it('shows an error and allows retrying', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockOutline({ data: undefined, error: new Error('Request failed'), isError: true, refetch });

    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('keeps existing curriculum visible when a background refresh fails', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockOutline({ refetch });

    const { rerender } = renderPage();
    mockOutline({ error: new Error('Refresh failed'), isError: true, refetch });
    rerender(pageElement());

    expect(screen.getByRole('heading', { name: 'Plants & Energy' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
