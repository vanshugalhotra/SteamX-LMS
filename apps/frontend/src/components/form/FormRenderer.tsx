import type { FieldErrors, FieldValues, Path, UseFormRegister } from 'react-hook-form';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface FieldConfig<T extends FieldValues> {
  name: Path<T>;
  label: string;
  type?: 'text' | 'email' | 'tel';
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  autoComplete?: string;
  autoCapitalize?: string;
  /** 'half' puts two fields side by side from the sm breakpoint. Default 'full'. */
  width?: 'full' | 'half';
}

interface FormRendererProps<T extends FieldValues> {
  fields: FieldConfig<T>[];
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  disabled?: boolean;
}

export function FormRenderer<T extends FieldValues>({
  fields,
  register,
  errors,
  disabled,
}: FormRendererProps<T>) {
  const errorMap = errors as Record<string, { message?: unknown } | undefined>;

  return (
    <div className="grid gap-x-3 sm:grid-cols-2">
      {fields.map((field) => {
        const message = errorMap[field.name]?.message;
        return (
          <div key={field.name} className={cn(field.width === 'half' ? '' : 'sm:col-span-2')}>
            <FormField
              label={field.required ? `${field.label} *` : field.label}
              error={typeof message === 'string' ? message : undefined}
            >
              {(control) => (
                <Input
                  {...control}
                  {...register(field.name)}
                  type={field.type ?? 'text'}
                  placeholder={field.placeholder}
                  readOnly={field.readOnly}
                  autoComplete={field.autoComplete ?? 'off'}
                  autoCapitalize={field.autoCapitalize}
                  disabled={disabled}
                />
              )}
            </FormField>
          </div>
        );
      })}
    </div>
  );
}
