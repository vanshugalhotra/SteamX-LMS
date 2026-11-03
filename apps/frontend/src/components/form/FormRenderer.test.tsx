import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { FormRenderer, type FieldConfig } from './FormRenderer';

interface TestFormValues {
  description: string;
}

const fields: FieldConfig<TestFormValues>[] = [
  {
    name: 'description',
    label: 'Description',
    type: 'textarea',
    readOnly: true,
  },
];

function TestForm() {
  const { register, control, formState } = useForm<TestFormValues>({
    defaultValues: { description: 'Existing details' },
  });

  return (
    <FormRenderer fields={fields} register={register} control={control} errors={formState.errors} />
  );
}

describe('FormRenderer', () => {
  it('renders a read-only textarea when configured', () => {
    render(<TestForm />);

    const description = screen.getByRole('textbox', { name: 'Description' });
    expect(description).toHaveAttribute('readonly');
  });
});
