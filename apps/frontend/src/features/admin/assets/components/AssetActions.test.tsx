import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AssetActions } from './AssetActions';

describe('AssetActions', () => {
  it('keeps replacement between rename and lifecycle actions', () => {
    render(
      <AssetActions
        status="ACTIVE"
        statusPending={false}
        deleteBlockedReason={null}
        replacementAction={<div>Replace file</div>}
        onRename={vi.fn()}
        onToggleStatus={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const labels = screen.getAllByRole('button').map((button) => button.textContent);
    expect(labels).toEqual([
      'RenameChange the title shown in the library',
      'ArchiveStop it being added to new lessons',
      'DeletePermanently remove this asset',
    ]);
    expect(
      screen
        .getByText('Replace file')
        .compareDocumentPosition(screen.getByRole('button', { name: /Archive/ })),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('calls the selected action and explains why delete is disabled', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    const onToggleStatus = vi.fn();
    const onDelete = vi.fn();

    render(
      <AssetActions
        status="ARCHIVED"
        statusPending={false}
        deleteBlockedReason="Used in 2 lessons. Remove it first."
        replacementAction={<div>Replace file</div>}
        onRename={onRename}
        onToggleStatus={onToggleStatus}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Rename/ }));
    await user.click(screen.getByRole('button', { name: /Unarchive/ }));

    expect(onRename).toHaveBeenCalledOnce();
    expect(onToggleStatus).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /Delete/ })).toBeDisabled();
    expect(screen.getByText('Used in 2 lessons. Remove it first.')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
