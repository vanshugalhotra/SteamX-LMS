import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AsyncMultiSelect } from './async-multi-select';
import type { AsyncOption } from './async-select';

const options: AsyncOption[] = [
  { value: 'student-1', label: 'Ada Student', description: 'STU-001' },
  { value: 'student-2', label: 'Bea Student', description: 'STU-002' },
];

function MultiSelectHarness({ maxSelected }: { maxSelected?: number } = {}) {
  const [selectedOptions, setSelectedOptions] = useState<AsyncOption[]>([]);

  return (
    <AsyncMultiSelect
      aria-label="Search active students"
      selectedLabel="Selected students"
      selectedOptions={selectedOptions}
      onChange={setSelectedOptions}
      maxSelected={maxSelected}
      useSearch={() => ({ options, isPending: false, isError: false })}
    />
  );
}

describe('AsyncMultiSelect', () => {
  it('adds options as removable selections and excludes selected options from search', async () => {
    const user = userEvent.setup();
    render(<MultiSelectHarness />);
    const search = screen.getByRole('combobox', { name: 'Search active students' });

    await user.click(search);
    await user.click(screen.getByRole('option', { name: 'Ada Student STU-001' }));
    expect(screen.getByRole('list', { name: 'Selected students' })).toHaveTextContent(
      'Ada Student',
    );

    await user.click(search);
    expect(screen.queryByRole('option', { name: 'Ada Student STU-001' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Bea Student STU-002' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Ada Student (STU-001)' }));
    expect(screen.queryByRole('list', { name: 'Selected students' })).not.toBeInTheDocument();

    await user.click(search);
    expect(screen.getByRole('option', { name: 'Ada Student STU-001' })).toBeInTheDocument();
  });

  it('prevents exceeding the selection limit while allowing removal', async () => {
    const user = userEvent.setup();
    render(<MultiSelectHarness maxSelected={1} />);
    const search = screen.getByRole('combobox', { name: 'Search active students' });

    await user.click(search);
    await user.click(screen.getByRole('option', { name: 'Ada Student STU-001' }));

    expect(search).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove Ada Student (STU-001)' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Remove Ada Student (STU-001)' }));
    expect(search).toBeEnabled();
  });
});
