import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { API_ERROR_CODE } from '@/lib/api-errors';
import type {
  Lesson,
  LessonContent,
  LessonContentBlock,
  SaveLessonContentPayload,
} from '../model/types';
import { LessonEditor } from './LessonEditor';

const { saveContent, updateLesson, handout } = vi.hoisted(() => ({
  saveContent:
    vi.fn<(input: { id: string; body: SaveLessonContentPayload }) => Promise<LessonContent>>(),
  updateLesson: vi.fn<(input: { id: string; body: { title: string } }) => Promise<Lesson>>(),
  handout: {
    id: 'asset-1',
    type: 'PDF',
    title: 'Handout',
    status: 'ACTIVE',
    createdAt: '',
    updatedAt: '',
    file: {
      id: 'file-1',
      status: 'READY',
      lastError: null,
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      originalFilename: 'handout.pdf',
    },
  },
}));
vi.mock('../queries', () => ({
  useSaveLessonContent: () => ({ mutateAsync: saveContent, isPending: false }),
  useUpdateLesson: () => ({ mutateAsync: updateLesson, isPending: false }),
}));
vi.mock('@/features/admin/assets/queries', () => ({
  useAssets: () => ({
    data: { items: [handout], page: 1, limit: 24, total: 1 },
    isPending: false,
    error: null,
  }),
}));

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
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <LessonEditor
          lesson={lesson}
          content={{ version: 3, blocks, assets: {} }}
          onReload={onReload}
        />
      ),
    },
    { path: '/curriculum', element: <p>Curriculum</p> },
  ]);
  render(<RouterProvider router={router} />);
  return { onReload, router };
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
  saveContent.mockRejectedValue(
    new ApiError(409, 'Conflict', { code: API_ERROR_CODE.VERSION_CONFLICT }),
  );
  const { onReload } = renderEditor();
  await user.click(screen.getByRole('button', { name: 'Add rich text block' }));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(
    await screen.findByText('This lesson changed while you were editing.'),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Reload latest version' }));
  expect(onReload).toHaveBeenCalledOnce();
});

it('does not offer a reload for other 409 errors', async () => {
  const user = userEvent.setup();
  saveContent.mockRejectedValue(new ApiError(409, 'Conflict', { code: API_ERROR_CODE.CONFLICT }));
  renderEditor();
  await user.click(screen.getByRole('button', { name: 'Add rich text block' }));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('This already exists.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reload latest version' })).not.toBeInTheDocument();
});

it('inserts the chosen block type between two blocks', async () => {
  const user = userEvent.setup();
  renderEditor([textBlock('a'), textBlock('b')]);
  await user.click(screen.getByRole('button', { name: 'Insert block before block 2' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Rich text' }));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  const ids = savedBlocks().map((b) => b.id);
  expect(ids).toHaveLength(3);
  expect([ids[0], ids[2]]).toEqual(['a', 'b']);
});

it('offers every block type in the divider menu', async () => {
  const user = userEvent.setup();
  renderEditor([textBlock('a'), textBlock('b')]);
  await user.click(screen.getByRole('button', { name: 'Insert block before block 2' }));
  for (const name of ['Rich text', 'Accordion', 'Two columns', 'Image', 'Video', 'PDF']) {
    expect(await screen.findByRole('menuitem', { name })).toBeInTheDocument();
  }
});

it('requires an accordion title and saves its content shape', async () => {
  const user = userEvent.setup();
  renderEditor();
  await user.click(screen.getByRole('button', { name: 'Add accordion block' }));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(screen.getByText('Add an accordion title to save this block.')).toBeInTheDocument();
  expect(saveContent).not.toHaveBeenCalled();

  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Common wiring mistakes');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(savedBlocks()).toMatchObject([
    {
      type: 'ACCORDION',
      content: {
        title: 'Common wiring mistakes',
        body: { format: 'tiptap', doc: { type: 'doc' } },
      },
    },
  ]);
});

it('adds and saves a block inside a column without allowing nested layouts', async () => {
  const user = userEvent.setup();
  renderEditor();
  await user.click(screen.getByRole('button', { name: 'Add two columns block' }));
  await user.click(screen.getByRole('button', { name: 'Add block to column 1' }));
  expect(await screen.findByRole('menuitem', { name: 'Rich text' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'Two columns' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('menuitem', { name: 'Rich text' }));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(savedBlocks()).toMatchObject([
    {
      type: 'TWO_COLUMN',
      columns: [{ type: 'RICH_TEXT' }, null],
    },
  ]);
});

it('blocks saving a column child that needs an asset', async () => {
  const user = userEvent.setup();
  renderEditor();
  await user.click(screen.getByRole('button', { name: 'Add two columns block' }));
  await user.click(screen.getByRole('button', { name: 'Add block to column 1' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Image' }));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(screen.getByText('Choose a file to save this block.')).toBeInTheDocument();
  expect(saveContent).not.toHaveBeenCalled();
});

it('updates a nested accordion and preserves its body when saving', async () => {
  const user = userEvent.setup();
  const accordion: LessonContentBlock = {
    id: 'nested-accordion',
    type: 'ACCORDION',
    content: {
      title: 'Old title',
      body: {
        format: 'tiptap',
        doc: { type: 'doc', content: [{ type: 'paragraph' }] },
      },
    },
  };
  const layout: LessonContentBlock = {
    id: 'layout',
    type: 'TWO_COLUMN',
    content: {},
    columns: [accordion, null],
  };
  renderEditor([layout]);
  const title = screen.getByRole('textbox', { name: 'Title (Column 1)' });
  await user.clear(title);
  await user.type(title, 'Updated title');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(savedBlocks()).toMatchObject([
    {
      columns: [
        {
          type: 'ACCORDION',
          content: {
            title: 'Updated title',
            body: { format: 'tiptap', doc: { type: 'doc' } },
          },
        },
        null,
      ],
    },
  ]);
});

it('removes a nested block and leaves its column empty', async () => {
  const user = userEvent.setup();
  const layout: LessonContentBlock = {
    id: 'layout',
    type: 'TWO_COLUMN',
    content: {},
    columns: [textBlock('nested'), null],
  };
  renderEditor([layout]);
  await user.click(
    screen.getByRole('button', { name: 'Remove Rich text block from column 1' }),
  );
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(savedBlocks()).toMatchObject([
    { type: 'TWO_COLUMN', columns: [null, null] },
  ]);
});

it('blocks saving an image block that has no file', async () => {
  const user = userEvent.setup();
  renderEditor();
  await user.click(screen.getByRole('button', { name: 'Add image block' }));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(screen.getByText('Choose a file to save this block.')).toBeInTheDocument();
  expect(saveContent).not.toHaveBeenCalled();
});

it('saves a picked asset with its caption on a PDF block', async () => {
  const user = userEvent.setup();
  renderEditor();
  await user.click(screen.getByRole('button', { name: 'Add pdf block' }));
  await user.click(screen.getByRole('button', { name: 'Choose from Asset Library' }));
  await user.click(screen.getByRole('button', { name: /Handout/ }));
  await user.click(screen.getByRole('button', { name: 'Use PDF' }));
  await user.type(screen.getByRole('textbox', { name: 'Caption (optional)' }), 'Read first');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(savedBlocks()).toMatchObject([
    { type: 'PDF', assetId: 'asset-1', content: { caption: 'Read first' } },
  ]);
});

it('asks before leaving with unsaved changes', async () => {
  const user = userEvent.setup();
  const { router } = renderEditor();
  await user.click(screen.getByRole('button', { name: 'Add rich text block' }));
  await act(() => router.navigate('/curriculum'));
  expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(router.state.location.pathname).toBe('/');
  await act(() => router.navigate('/curriculum'));
  await user.click(await screen.findByRole('button', { name: 'Leave page' }));
  expect(router.state.location.pathname).toBe('/curriculum');
});

it('leaves without a prompt when nothing changed', async () => {
  const { router } = renderEditor();
  await act(() => router.navigate('/curriculum'));
  expect(router.state.location.pathname).toBe('/curriculum');
});

it('shows a backend title error next to the field', async () => {
  const user = userEvent.setup();
  updateLesson.mockRejectedValue(
    new ApiError(400, 'Invalid', {
      code: API_ERROR_CODE.VALIDATION_ERROR,
      details: [{ field: 'title', errors: ['Title is too long'] }],
    }),
  );
  renderEditor([textBlock('a')]);
  const input = screen.getByRole('textbox', { name: 'Lesson title' });
  expect(input).toHaveAttribute('maxlength', '200');
  await user.type(input, ' x');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('Title is too long')).toBeInTheDocument();
  expect(input).toBeInvalid();
  expect(input).toHaveAccessibleDescription('Title is too long');
  expect(saveContent).not.toHaveBeenCalled();
});

it('moves between toolbar buttons with the arrow keys', async () => {
  const user = userEvent.setup();
  renderEditor([textBlock('a')]);
  const undo = screen.getByRole('button', { name: 'Undo' });
  act(() => {
    undo.focus();
  });
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('button', { name: 'Redo' })).toHaveFocus();
});
