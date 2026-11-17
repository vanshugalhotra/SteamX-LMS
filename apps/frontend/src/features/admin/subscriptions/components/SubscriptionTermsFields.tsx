import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { FormSection } from '@/components/form/FormSection';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import type { SubscriptionFormValues } from '../model/schemas';

interface SubscriptionTermsFieldsProps {
  register: UseFormRegister<SubscriptionFormValues>;
  errors: FieldErrors<SubscriptionFormValues>;
  disabled: boolean;
  startDateDisabled?: boolean;
}

export function SubscriptionTermsFields({
  register,
  errors,
  disabled,
  startDateDisabled = false,
}: SubscriptionTermsFieldsProps) {
  return (
    <FormSection title="Subscription terms" accent="teal">
      <div className="grid gap-x-4 sm:grid-cols-2">
        <FormField label="Start date *" error={errors.startDate?.message}>
          {(aria) => (
            <Input
              {...aria}
              {...register('startDate')}
              type="date"
              disabled={disabled || startDateDisabled}
              className="h-10.5"
            />
          )}
        </FormField>
        <FormField label="End date *" error={errors.endDate?.message}>
          {(aria) => (
            <Input
              {...aria}
              {...register('endDate')}
              type="date"
              disabled={disabled}
              className="h-10.5"
            />
          )}
        </FormField>
        <FormField label="Max deliveries *" error={errors.maxDeliveries?.message}>
          {(aria) => (
            <Input
              {...aria}
              {...register('maxDeliveries', { valueAsNumber: true })}
              type="number"
              min={1}
              step={1}
              placeholder="e.g. 4"
              disabled={disabled}
              className="h-10.5"
            />
          )}
        </FormField>
        <p className="self-center text-xs text-gray-600">
          How many active deliveries this school can run for the course.
        </p>
      </div>
    </FormSection>
  );
}
