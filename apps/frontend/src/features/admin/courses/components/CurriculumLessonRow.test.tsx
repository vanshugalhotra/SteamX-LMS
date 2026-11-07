import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { PATHS } from '@/lib/paths';
import type { CourseOutlineLesson } from '../model/types';
import { CurriculumLessonRow } from './CurriculumLessonRow';

it('links the lesson title to the lesson editor', () => {
  const lesson = {
    id: 'lesson-1',
    title: 'Ultrasonic sensors',
    status: 'DRAFT',
    audience: 'STUDENT',
  } as CourseOutlineLesson;
  render(
    <MemoryRouter>
      <ul>
        <CurriculumLessonRow
          lesson={lesson}
          index={0}
          count={1}
          reordering={false}
          onEdit={vi.fn()}
          onMove={vi.fn()}
          onRequestStatus={vi.fn()}
        />
      </ul>
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: 'Ultrasonic sensors' })).toHaveAttribute(
    'href',
    PATHS.admin.lessonEdit('lesson-1'),
  );
});
