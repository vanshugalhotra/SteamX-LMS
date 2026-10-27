import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { FormPageLayout } from '@/components/form/FormPageLayout';
import { FormRenderer } from '@/components/form/FormRenderer';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { API_ERROR_CODE, getErrorMessage, hasErrorCode } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import { CLASS_SECTION_FIELDS } from '../config/class-sections.config';
import { classSectionSchema, type ClassSectionFormValues } from '../model/schemas';
import { useCreateClassSection } from '../queries';

export function ClassSectionCreatePage() {
  const navigate = useNavigate();
  const create = useCreateClassSection();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClassSectionFormValues>({
    resolver: zodResolver(classSectionSchema),
    defaultValues: { schoolId: '', className: '', sectionName: '' },
  });
  const busy = isSubmitting || create.isPending;

  const onSubmit = handleSubmit(async (values) => {
    if (busy) return;
    setFormError(null);
    const { sectionName, ...rest } = values;
    try {
      // An empty section is not sent, so the backend applies its default ("All").
      await create.mutateAsync(sectionName ? { ...rest, sectionName } : rest);
      toast.success('Class section created');
      // Keep the school and class so several sections can be added in a row.
      reset({ schoolId: values.schoolId, className: values.className, sectionName: '' });
    } catch (error) {
      if (hasErrorCode(error, API_ERROR_CODE.CLASS_SECTION_EXISTS)) {
        setError('className', { message: getErrorMessage(error) });
        return;
      }
      setFormError(getErrorMessage(error));
    }
  });

  return (
    <FormPageLayout
      title="Add class section"
      subtitle="Create a class (and optionally a section) inside a school so students can be assigned to it."
      backTo={PATHS.admin.students}
      backLabel="Students"
    >
      <form
        noValidate
        onSubmit={(e) => {
          void onSubmit(e);
        }}
      >
        {formError && <Alert className="mb-5">{formError}</Alert>}
        <FormRenderer
          fields={CLASS_SECTION_FIELDS}
          register={register}
          control={control}
          errors={errors}
          disabled={busy}
        />
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-5">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void navigate(PATHS.admin.students);
            }}
          >
            Done
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Add class section'}
          </Button>
        </div>
      </form>
    </FormPageLayout>
  );
}
