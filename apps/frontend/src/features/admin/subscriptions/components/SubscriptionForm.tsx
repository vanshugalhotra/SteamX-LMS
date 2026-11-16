import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormSection } from '@/components/form/FormSection';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { API_ERROR_CODE, getErrorMessage, getFieldErrors, hasErrorCode } from '@/lib/api-errors';
import { formatDate } from '@/lib/date-helper';
import { useCourses } from '@/features/admin/courses/queries';
import type {
  CreateSubscriptionPayload,
  RenewSubscriptionPayload,
  Subscription,
  UpdateSubscriptionPayload,
} from '../model/types';
import { subscriptionFormSchema, type SubscriptionFormValues } from '../model/schemas';
import { useCreateSubscription, useRenewSubscription, useUpdateSubscription } from '../queries';
import { SubscriptionAccessFields } from './SubscriptionAccessFields';
import { SubscriptionTermsFields } from './SubscriptionTermsFields';

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};

function formatDateOnly(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDateDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateOnly(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate());
}

function formatSubscriptionDate(value: string) {
  return formatDate(`${value}T00:00:00`, 'en-GB', DATE_FORMAT);
}

type SubscriptionFormProps =
  | { mode: 'create'; onDone: () => void; onCancel: () => void }
  | {
      mode: 'edit' | 'renew';
      subscription: Subscription;
      onDone: () => void;
      onCancel: () => void;
    };

function getDefaultStartDate(
  subscription: Subscription | undefined,
  mode: 'create' | 'edit' | 'renew',
) {
  if (subscription && mode === 'edit') return subscription.startDate;
  if (subscription) return addDateDays(subscription.endDate, 1);
  const today = new Date();
  return formatDateOnly(today.getFullYear(), today.getMonth() + 1, today.getDate());
}

function getDefaultEndDate(
  startDate: string,
  subscription: Subscription | undefined,
  mode: SubscriptionFormProps['mode'],
) {
  if (subscription && mode === 'edit') return subscription.endDate;
  const [year, month, day] = startDate.split('-').map(Number);
  const result = new Date(Date.UTC(year + 1, month - 1, day - 1));
  return formatDateOnly(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate());
}

export function SubscriptionForm(props: SubscriptionFormProps) {
  const { mode, onDone, onCancel } = props;
  const subscription = mode === 'create' ? undefined : props.subscription;
  const create = useCreateSubscription();
  const renew = useRenewSubscription();
  const update = useUpdateSubscription();
  const courses = useCourses(
    { page: 1, limit: 100, q: '', status: 'ACTIVE' },
    { enabled: !subscription },
  );
  const [formError, setFormError] = useState<string | null>(null);
  const startDate = getDefaultStartDate(subscription, mode);
  const {
    register,
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<SubscriptionFormValues>({
    resolver: zodResolver(subscriptionFormSchema),
    defaultValues: {
      schoolId: subscription?.schoolId ?? '',
      courseId: subscription?.courseId ?? '',
      startDate,
      endDate: getDefaultEndDate(startDate, subscription, mode),
      maxDeliveries: subscription?.maxDeliveries,
    },
  });
  const busy = isSubmitting || create.isPending || renew.isPending || update.isPending;

  const showError = (error: unknown) => {
    const fieldErrors = getFieldErrors(error);
    const fields = ['schoolId', 'courseId', 'startDate', 'endDate', 'maxDeliveries'] as const;
    let hasMappedFieldError = false;
    for (const field of fields) {
      if (Object.hasOwn(fieldErrors, field)) {
        setError(field, { message: fieldErrors[field] });
        hasMappedFieldError = true;
      }
    }
    if (hasMappedFieldError) return;

    if (hasErrorCode(error, API_ERROR_CODE.SUBSCRIPTION_OVERLAP)) {
      const field = mode === 'edit' ? 'endDate' : 'startDate';
      setError(field, { message: getErrorMessage(error) });
      setFocus(field);
      return;
    }
    if (hasErrorCode(error, API_ERROR_CODE.DELIVERY_CAP_BELOW_ACTIVE)) {
      setError('maxDeliveries', { message: getErrorMessage(error) });
      setFocus('maxDeliveries');
      return;
    }
    setFormError(getErrorMessage(error));
  };

  const onSubmit = handleSubmit(async (values) => {
    if (busy) return;
    setFormError(null);
    try {
      if (mode === 'edit' && subscription) {
        const body: UpdateSubscriptionPayload = {
          endDate: values.endDate,
          maxDeliveries: values.maxDeliveries,
        };
        await update.mutateAsync({ id: subscription.id, body });
        toast.success('Subscription updated');
      } else if (mode === 'renew' && subscription) {
        const body: RenewSubscriptionPayload = {
          startDate: values.startDate,
          endDate: values.endDate,
          maxDeliveries: values.maxDeliveries,
        };
        await renew.mutateAsync({ id: subscription.id, body });
        toast.success('Subscription renewed');
      } else {
        const body: CreateSubscriptionPayload = {
          schoolId: values.schoolId,
          courseId: values.courseId,
          startDate: values.startDate,
          endDate: values.endDate,
          maxDeliveries: values.maxDeliveries,
        };
        await create.mutateAsync(body);
        toast.success('Subscription created');
      }
      onDone();
    } catch (error) {
      showError(error);
    }
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      className="space-y-5"
    >
      {formError && <Alert>{formError}</Alert>}
      {subscription && (
        <p className="rounded-xl bg-gray-50 p-4 text-xs leading-relaxed text-gray-600">
          {mode === 'edit'
            ? 'Update the subscription end date or delivery limit. School, course, and start date cannot be changed.'
            : `Renewing adds a new term that starts after ${formatSubscriptionDate(subscription.endDate)}. The current term stays on record.`}
        </p>
      )}

      {subscription ? (
        <FormSection title="Access" accent="coral">
          <div className="grid gap-x-4 sm:grid-cols-2">
            <FormField label="School">
              {(aria) => (
                <Input {...aria} value={subscription.schoolName} disabled className="h-10.5" />
              )}
            </FormField>
            <FormField label="Course">
              {(aria) => (
                <Input {...aria} value={subscription.courseTitle} disabled className="h-10.5" />
              )}
            </FormField>
          </div>
        </FormSection>
      ) : (
        <SubscriptionAccessFields
          control={control}
          register={register}
          errors={errors}
          disabled={busy}
          courses={courses}
        />
      )}
      <SubscriptionTermsFields
        register={register}
        errors={errors}
        disabled={busy}
        startDateDisabled={mode === 'edit'}
      />

      <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-5">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            busy ||
            (!subscription && (courses.isPending || courses.isError || !courses.data.items.length))
          }
        >
          {busy
            ? mode === 'create'
              ? 'Creating…'
              : mode === 'edit'
                ? 'Saving…'
                : 'Renewing…'
            : mode === 'create'
              ? 'Create subscription'
              : mode === 'edit'
                ? 'Save changes'
                : 'Renew subscription'}
        </Button>
      </div>
    </form>
  );
}
