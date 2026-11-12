import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSONContent } from '@tiptap/react';
import { expect, it, vi } from 'vitest';
import { RichTextEditor } from './RichTextEditor';
import { TOOLBAR_ITEMS } from './toolbar-config';

const doc: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

it('renders every formatting action as a named button', () => {
  render(<RichTextEditor initialValue={doc} editable onChange={vi.fn()} />);
  const toolbar = screen.getByRole('toolbar', { name: 'Text formatting' });
  for (const item of TOOLBAR_ITEMS) {
    expect(within(toolbar).getByRole('button', { name: item.label })).toBeInTheDocument();
  }
});

it('toggles the pressed state of a formatting button', async () => {
  const user = userEvent.setup();
  render(<RichTextEditor initialValue={doc} editable onChange={vi.fn()} />);
  const bold = screen.getByRole('button', { name: 'Bold' });
  expect(bold).toHaveAttribute('aria-pressed', 'false');
  await user.click(bold);
  expect(bold).toHaveAttribute('aria-pressed', 'true');
});
