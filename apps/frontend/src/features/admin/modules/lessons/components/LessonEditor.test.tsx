import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import type {
  Lesson,
  LessonContent,
  LessonContentBlock,
  SaveLessonContentPayload,
} from '../model/types';

const { saveContent, updateLesson } = vi.hoisted(() => ({
  saveContent:
    vi.fn<(input: { id: string; body: SaveLessonContentPayload }) => Promise<LessonContent>>(),
  updateLesson: vi.fn<(input: { id: string; body: { title: string } }) => Promise<Lesson>>(),
}));
vi.mock('../queries', () => ({
  useSaveLessonContent: () => ({ mutateAsync: saveContent, isPending: false }),
  useUpdateLesson: () => ({ mutateAsync: updateLesson, isPending: false }),
}));
import { LessonEditor } from './LessonEditor';

const lesson: Lesson = {
  id: 'lesson-1',
  moduleId: 'module-1',
  courseId: 'course-1',
  title: 'Ultrasonic sensors',
  position: 1,
  status: 'DRAFT',
  audience: 'STUDENT',
  createdAt: '',
  updatedAt: '',
};

const textBlock = (id: string): LessonContentBlock => ({
  id,
  type: 'RICH_TEXT',
  content: { format: 'tiptap', doc: { type: 'doc', content: [{ type: 'paragraph' }] } },
});

function renderEditor(blocks: LessonContentBlock[] = [], onReload = vi.fn()) {
  render(
    <LessonEditor
      lesson={lesson}
      content={{ version: 3, blocks, assets: {} }}
      onReload={onReload}
    />,
  );
  return { onReload };
}

const savedBlocks = () => saveContent.mock.calls[0][0].body.blocks;

beforeEach(() => {
  vi.clearAllMocks();
  saveContent.mockImplementation(({ body }) =>
    Promise.resolve({ version: 4, blocks: body.blocks, assets: {} }),
  );
});

it('disables save until something changes', async () => {
  const user = userEvent.setup();
  renderEditor();
  const save = screen.getByRole('button', { name: 'Save changes' });
  expect(save).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Add rich text block' }));
  expect(save).toBeEnabled();
});

it('blocks saving an empty title without calling the API', async () => {
  const user = userEvent.setup();
  renderEditor([textBlock('a')]);
  await user.clear(screen.getByRole('textbox', { name: 'Lesson title' }));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(screen.getByText('Add a title for this lesson.')).toBeInTheDocument();
  expect(updateLesson).not.toHaveBeenCalled();
  expect(saveContent).not.toHaveBeenCalled();
});

it('adds a rich-text block and saves with the current version', async () => {
  const user = userEvent.setup();
  renderEditor();
  await user.click(screen.getByRole('button', { name: 'Add rich text block' }));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(saveContent.mock.calls[0][0].body).toMatchObject({
    expectedVersion: 3,
    blocks: [{ type: 'RICH_TEXT' }],
  });
  expect(await screen.findByText(/All changes saved/)).toBeInTheDocument();
});

it('saves a trimmed title through the lesson endpoint', async () => {
  const user = userEvent.setup();
  renderEditor([textBlock('a')]);
  await user.type(screen.getByRole('textbox', { name: 'Lesson title' }), ' v2  ');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(updateLesson).toHaveBeenCalledWith({
    id: 'lesson-1',
    body: { title: 'Ultrasonic sensors v2' },
  });
  expect(saveContent).not.toHaveBeenCalled();
});

it('removes and reorders blocks', async () => {
  const user = userEvent.setup();
  renderEditor([textBlock('a'), textBlock('b')]);
  await user.click(screen.getAllByRole('button', { name: 'Move Rich text block up' })[1]);
  await user.click(screen.getAllByRole('button', { name: 'Remove Rich text block' })[1]);
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(savedBlocks().map((b) => b.id)).toEqual(['b']);
});

it('offers a reload on version conflict', async () => {
  const user = userEvent.setup();
  saveContent.mockRejectedValue(new ApiError(409, 'Conflict'));
  const { onReload } = renderEditor();
  await user.click(screen.getByRole('button', { name: 'Add rich text block' }));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(
    await screen.findByText('This lesson changed while you were editing.'),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Reload latest version' }));
  expect(onReload).toHaveBeenCalledOnce();
});
