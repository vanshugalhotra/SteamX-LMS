import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormRenderer } from '@/components/form/FormRenderer';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getErrorMessage, getFieldErrors } from '@/lib/api-errors';
import type { Course } from '../model/types';
import { courseFields } from '../config/courses.config';
import { CourseStatusSection } from './CourseStatusSection';
import { courseSchema, type CourseFormValues } from '../model/schemas';
import { useCreateCourse, useUpdateCourse } from '../queries';

interface CourseFormProps {
  course?: Course;
  onDone: (createdCourseId?: string) => void;
  onCancel: () => void;
}

export function CourseForm({ course, onDone, onCancel }: CourseFormProps) {
  const create = useCreateCourse();
  const update = useUpdateCourse();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CourseFormValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      title: course?.title ?? '',
      description: course?.description ?? '',
    },
  });

  const busy = isSubmitting || create.isPending || update.isPending;
  const showError = (error: unknown) => {
    const fieldErrors = getFieldErrors(error);
    let hasMappedFieldError = false;
    for (const field of ['title', 'description'] as const) {
      if (Object.hasOwn(fieldErrors, field)) {
        setError(field, { message: fieldErrors[field] });
        hasMappedFieldError = true;
      }
    }
    if (hasMappedFieldError) {
      return;
    }

    setFormError(getErrorMessage(error));
  };

  const onSubmit = handleSubmit(async (values) => {
    if (busy) return;
    setFormError(null);
    const body = {
      title: values.title,
      description: values.description === '' ? null : values.description,
    };
    try {
      if (course) {
        await update.mutateAsync({ id: course.id, body });
        toast.success('Course changes saved');
        onDone();
      } else {
        const createdCourse = await create.mutateAsync(body);
        toast.success('Course created as a draft');
        onDone(createdCourse.id);
      }
    } catch (error) {
      showError(error);
    }
  });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form
        noValidate
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        className="min-w-0 space-y-5 rounded-3xl bg-gray-50 p-5 sm:p-6"
      >
        {formError && <Alert className="mb-2">{formError}</Alert>}
        <FormRenderer
          fields={courseFields}
          register={register}
          errors={errors}
          control={control}
          disabled={busy}
        />
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 pt-5">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : course ? 'Save changes' : 'Add course'}
          </Button>
        </div>
      </form>
      <CourseStatusSection course={course} />
    </div>
  );
}
