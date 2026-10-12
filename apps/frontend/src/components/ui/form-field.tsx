import { useId, type ReactNode } from 'react';

interface ControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
}

interface FormFieldProps {
  label: string;
  error?: string | undefined;
  /** Spread the given props onto the input so label + error are wired for a11y. */
  children: (control: ControlProps) => ReactNode;
}

export function FormField({ label, error, children }: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="mb-4.5">
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium">
        {label}
      </label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': error ? errorId : undefined,
      })}
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
