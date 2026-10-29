import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormRenderer } from '@/components/form/FormRenderer';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { API_ERROR_CODE, getErrorMessage, hasErrorCode } from '@/lib/api-errors';
import { getClassSectionFields } from '../config/class-sections.config';
import {
  createClassSectionSchema,
  editClassSectionSchema,
  type ClassSectionFormValues,
} from '../model/schemas';
import type { ClassSection } from '../model/types';
import { useCreateClassSection, useUpdateClassSection } from '../queries';

interface ClassSectionFormProps {
  section?: ClassSection;
  schoolName?: string;
  onDone: () => void;
  onCancel: () => void;
}

export function ClassSectionForm({
  section,
  schoolName = '',
  onDone,
  onCancel,
}: ClassSectionFormProps) {
  const create = useCreateClassSection();
  const update = useUpdateClassSection();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ClassSectionFormValues>({
    resolver: zodResolver(section ? editClassSectionSchema : createClassSectionSchema),
    defaultValues: {
      schoolId: section?.schoolId ?? '',
      className: section?.className ?? '',
      sectionName: section?.sectionName ?? '',
      schoolName,
    },
  });
  const busy = isSubmitting || create.isPending || update.isPending;

  const onSubmit = handleSubmit(async (values) => {
    if (busy) return;
    setFormError(null);
    try {
      if (section) {
        await update.mutateAsync({
          id: section.id,
          body: { className: values.className, sectionName: values.sectionName },
        });
      } else {
        // An empty section is not sent, so the backend applies its default ("All").
        const payload = { schoolId: values.schoolId, className: values.className };
        await create.mutateAsync(
        values.sectionName ? { ...payload, sectionName: values.sectionName } : payload,
        );
      }
      toast.success(section ? 'Changes saved' : 'Class section created');
      onDone();
    } catch (error) {
      if (hasErrorCode(error, API_ERROR_CODE.CLASS_SECTION_EXISTS)) {
        setError('className', { message: getErrorMessage(error) });
        return;
      }
      setFormError(getErrorMessage(error));
    }
  });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        void onSubmit(e);
      }}
    >
      {formError && <Alert className="mb-5">{formError}</Alert>}
      <FormRenderer
        fields={getClassSectionFields(Boolean(section))}
        register={register}
        control={control}
        errors={errors}
        disabled={busy}
      />
      <div className="flex justify-end gap-3 border-t border-gray-200 pt-5">
        <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : section ? 'Save changes' : 'Add class section'}
        </Button>
      </div>
    </form>
  );
}
