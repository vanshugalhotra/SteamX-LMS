import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { FormSection } from '@/components/form/FormSection';
import { Alert } from '@/components/ui/alert';
import { AsyncSelect } from '@/components/ui/async-select';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import type { useCourses } from '@/features/admin/courses/queries';
import { useSchoolSearch } from '@/features/admin/schools/queries';
import type { SubscriptionFormValues } from '../model/schemas';

interface SubscriptionAccessFieldsProps {
  control: Control<SubscriptionFormValues>;
  register: UseFormRegister<SubscriptionFormValues>;
  errors: FieldErrors<SubscriptionFormValues>;
  disabled: boolean;
  courses: ReturnType<typeof useCourses>;
}

export function SubscriptionAccessFields({
  control,
  register,
  errors,
  disabled,
  courses,
}: SubscriptionAccessFieldsProps) {
  return (
    <FormSection title="Access" accent="coral">
      <div className="grid gap-x-4 sm:grid-cols-2">
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
                  placeholder="Select school"
                  disabled={disabled}
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
              disabled={disabled || courses.isPending || courses.isError}
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
          <div className="space-y-2 sm:col-span-2" role="alert">
            <Alert>We couldn&apos;t load active courses.</Alert>
            <Button type="button" variant="secondary" onClick={() => void courses.refetch()}>
              Retry courses
            </Button>
          </div>
        )}
        {!courses.isPending && !courses.isError && courses.data.items.length === 0 && (
          <p className="text-xs text-gray-600 sm:col-span-2">No active courses are available.</p>
        )}
        {!courses.isError && (
          <p className="text-xs text-gray-600 sm:col-span-2">
            Only active courses can be subscribed to.
          </p>
        )}
      </div>
    </FormSection>
  );
}
