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

  it('reports the selected option without changing existing selection behavior', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSelectOption = vi.fn();
    const option = { value: 'student-1', label: 'Ada Student', description: 'STU-001' };
    const useSearch = () => ({ options: [option], isPending: false, isError: false });

    render(
      <AsyncSelect
        aria-label="Search students"
        value=""
        onChange={onChange}
        onSelectOption={onSelectOption}
        useSearch={useSearch}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Search students' }));
    await user.click(screen.getByRole('option', { name: 'Ada Student STU-001' }));

    expect(onChange).toHaveBeenCalledWith('student-1');
    expect(onSelectOption).toHaveBeenCalledWith(option);
  });
});
