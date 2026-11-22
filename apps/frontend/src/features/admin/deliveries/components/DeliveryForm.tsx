import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormSection } from '@/components/form/FormSection';
import { Alert } from '@/components/ui/alert';
import { AsyncSelect } from '@/components/ui/async-select';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useCourses } from '@/features/admin/courses/queries';
import { useSchoolSearch } from '@/features/admin/schools/queries';
import { getErrorMessage, getFieldErrors } from '@/lib/api-errors';
import type { Delivery } from '../model/types';
import { deliveryFormSchema, type DeliveryFormValues } from '../model/schemas';
import { useCreateDelivery, useUpdateDeliveryLabel } from '../queries';

type DeliveryFormProps =
  | {
      mode: 'create';
      onDone: () => void;
      onCancel: () => void;
      onBusyChange?: (busy: boolean) => void;
    }
  | {
      mode: 'rename';
      delivery: Delivery;
      onDone: () => void;
      onCancel: () => void;
      onBusyChange?: (busy: boolean) => void;
    };

export function DeliveryForm(props: DeliveryFormProps) {
  const isCreate = props.mode === 'create';
  const delivery = props.mode === 'rename' ? props.delivery : undefined;
  const create = useCreateDelivery();
  const rename = useUpdateDeliveryLabel();
  const courses = useCourses(
    { page: 1, limit: 100, q: '', status: 'ACTIVE' },
    { enabled: isCreate },
  );
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DeliveryFormValues>({
    resolver: zodResolver(deliveryFormSchema),
    defaultValues: {
      schoolId: delivery?.schoolId ?? '',
      courseId: delivery?.course.id ?? '',
      academicYear: delivery?.academicYear ?? '',
      label: delivery?.label ?? '',
    },
  });
  const busy = isSubmitting || create.isPending || rename.isPending;

  const onSubmit = handleSubmit(async (values) => {
    if (busy) return;
    setFormError(null);
    props.onBusyChange?.(true);
    try {
      if (delivery) {
        await rename.mutateAsync({ id: delivery.id, body: { label: values.label } });
        toast.success('Delivery renamed');
      } else {
        await create.mutateAsync(values);
        toast.success('Delivery created');
      }
      props.onDone();
    } catch (error) {
      const fieldErrors = getFieldErrors(error);
      let hasFieldError = false;
      for (const field of ['schoolId', 'courseId', 'academicYear', 'label'] as const) {
        if (Object.hasOwn(fieldErrors, field)) {
          setError(field, { message: fieldErrors[field] });
          hasFieldError = true;
        }
      }
      if (!hasFieldError) setFormError(getErrorMessage(error));
    } finally {
      props.onBusyChange?.(false);
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
      <div>
        <h2 id="delivery-form-title" className="text-xl font-semibold">
          {delivery ? 'Rename delivery' : 'Create delivery'}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          {delivery
            ? 'Change the name shown for this delivery.'
            : 'Assign an active course to a school for an academic year.'}
        </p>
      </div>
      {formError && <Alert>{formError}</Alert>}
      {delivery ? (
        <FormSection title="Delivery name" accent="teal">
          <FormField label="Name *" error={errors.label?.message}>
            {(aria) => (
              <Input
                {...aria}
                {...register('label')}
                maxLength={100}
                autoFocus
                disabled={busy}
                placeholder="For example, Grade 5 Blue"
              />
            )}
          </FormField>
        </FormSection>
      ) : (
        <>
          <FormSection title="Delivery details" accent="coral">
            <FormField label="School *" error={errors.schoolId?.message}>
              {(aria) => (
                <Controller
                  control={control}
                  name="schoolId"
                  render={({ field }) => (
                    <AsyncSelect
                      {...aria}
                      value={field.value}
                      onChange={field.onChange}
                      useSearch={useSchoolSearch}
                      placeholder="Search active schools"
                      disabled={busy}
                    />
                  )}
                />
              )}
            </FormField>
            <FormField label="Course *" error={errors.courseId?.message}>
              {(aria) => (
                <Select
                  {...aria}
                  {...register('courseId')}
                  disabled={busy || courses.isPending || courses.isError}
                  className="w-full"
                >
                  <option value="">
                    {courses.isPending ? 'Loading active courses…' : 'Select course'}
                  </option>
                  {courses.data?.items.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            {courses.isError && (
              <div className="space-y-2" role="alert">
                <Alert>We couldn&apos;t load active courses.</Alert>
                <Button type="button" variant="secondary" onClick={() => void courses.refetch()}>
                  Retry courses
                </Button>
              </div>
            )}
            {!courses.isPending && !courses.isError && courses.data.items.length === 0 && (
              <p className="text-xs text-gray-600">No active courses are available.</p>
            )}
            <FormField label="Academic year *" error={errors.academicYear?.message}>
              {(aria) => (
                <Input
                  {...aria}
                  {...register('academicYear')}
                  maxLength={7}
                  disabled={busy}
                  placeholder="2026-27"
                />
              )}
            </FormField>
            <FormField label="Delivery name *" error={errors.label?.message}>
              {(aria) => (
                <Input
                  {...aria}
                  {...register('label')}
                  maxLength={100}
                  disabled={busy}
                  placeholder="For example, Grade 5 Blue"
                />
              )}
            </FormField>
          </FormSection>
          <p className="text-xs text-gray-600">
            A current school subscription and available delivery capacity are required.
          </p>
        </>
      )}
      <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-5">
        <Button type="button" variant="secondary" disabled={busy} onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            busy ||
            (isCreate && (courses.isPending || courses.isError || !courses.data.items.length))
          }
        >
          {busy ? 'Saving…' : delivery ? 'Save name' : 'Create delivery'}
        </Button>
      </div>
    </form>
  );
}
