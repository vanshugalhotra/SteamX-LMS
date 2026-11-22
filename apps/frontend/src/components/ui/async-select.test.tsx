import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AsyncSelect } from './async-select';

describe('AsyncSelect', () => {
  it('omits excluded values from the selectable options', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const useSearch = () => ({
      options: [
        { value: 'teacher-1', label: 'Already assigned' },
        { value: 'teacher-2', label: 'Available teacher' },
      ],
      isPending: false,
      isError: false,
    });

    render(
      <AsyncSelect
        aria-label="Search teachers"
        value=""
        onChange={onChange}
        useSearch={useSearch}
        excludeValues={['teacher-1']}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Search teachers' }));

    expect(screen.queryByRole('option', { name: 'Already assigned' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Available teacher' })).toBeInTheDocument();
  });
});
