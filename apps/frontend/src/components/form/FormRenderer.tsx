import type { FieldErrors, FieldValues, Path, UseFormRegister } from 'react-hook-form';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PasswordInput } from '@/components/ui/password-input';
import { Select } from '@/components/ui/select';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldConfig<T extends FieldValues> {
  name: Path<T>;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'password' | 'select';
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  autoComplete?: string;
  autoCapitalize?: string;
  /** Column span from the sm breakpoint (6-column grid). Default 'full'. */
  width?: 'full' | 'half' | 'third';
  options?: FieldOption[];
}

// Full class names so Tailwind can see them.
const SPAN = {
  full: 'sm:col-span-6',
  half: 'sm:col-span-3',
  third: 'sm:col-span-2',
} as const;

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
    <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-6">
      {fields.map((field) => {
        const message = errorMap[field.name]?.message;
        return (
          <div key={field.name} className={SPAN[field.width ?? 'full']}>
            <FormField
              label={field.required ? `${field.label} *` : field.label}
              error={typeof message === 'string' ? message : undefined}
            >
              {(control) => {
                if (field.type === 'select') {
                  return (
                    <Select
                      {...control}
                      {...register(field.name)}
                      className="w-full"
                      disabled={disabled === true || field.readOnly === true}
                    >
                      <option value="">{field.placeholder ?? 'Select'}</option>
                      {field.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  );
                }
                const Control = field.type === 'password' ? PasswordInput : Input;
                return (
                  <Control
                    {...control}
                    {...register(field.name)}
                    type={field.type === 'password' ? undefined : (field.type ?? 'text')}
                    placeholder={field.placeholder}
                    readOnly={field.readOnly}
                    className={cn(
                      'h-10.5',
                      field.readOnly && 'border-dashed bg-gray-50 text-gray-600',
                    )}
                    autoComplete={field.autoComplete ?? 'off'}
                    autoCapitalize={field.autoCapitalize}
                    disabled={disabled}
                  />
                );
              }}
            </FormField>
          </div>
        );
      })}
    </div>
  );
}
