import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormRenderer } from '@/components/form/FormRenderer';
import { getSchoolFields } from '../config/schools.config';
import { ApiError } from '@/lib/api-client';
import type { School, SchoolInput } from '../model/types';
import { SCHOOL_CODE_EXISTS, schoolErrorMessage, validationFieldErrors } from '../model/errors';
import { createSchoolSchema, editSchoolSchema, type SchoolFormValues } from '../model/schemas';
import { useCreateSchool, useUpdateSchool } from '../queries';

const toNull = (value: string) => (value === '' ? null : value);

function toInput(values: SchoolFormValues): SchoolInput {
  return {
    name: values.name,
    city: values.city,
    state: values.state,
    postalCode: values.postalCode,
    country: values.country,
    streetAddress: toNull(values.streetAddress),
    contactName: toNull(values.contactName),
    contactPhone: toNull(values.contactPhone),
    contactEmail: toNull(values.contactEmail),
  };
}

function toDefaults(school?: School): SchoolFormValues {
  return {
    code: school?.code ?? '',
    name: school?.name ?? '',
    city: school?.city ?? '',
    state: school?.state ?? '',
    postalCode: school?.postalCode ?? '',
    country: school?.country ?? '',
    streetAddress: school?.streetAddress ?? '',
    contactName: school?.contactName ?? '',
    contactPhone: school?.contactPhone ?? '',
    contactEmail: school?.contactEmail ?? '',
  };
}

interface SchoolFormProps {
  /** Present when editing. */
  school?: School;
  onDone: () => void;
  onCancel: () => void;
}

export function SchoolForm({ school, onDone, onCancel }: SchoolFormProps) {
  const create = useCreateSchool();
  const update = useUpdateSchool();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<SchoolFormValues>({
    resolver: zodResolver(school ? editSchoolSchema : createSchoolSchema),
    defaultValues: toDefaults(school),
  });

  const busy = isSubmitting || create.isPending || update.isPending;

  const showError = (error: unknown) => {
    if (error instanceof ApiError && error.code === SCHOOL_CODE_EXISTS) {
      setError('code', { message: 'This school code is already in use.' });
      setFocus('code');
      return;
    }
    const fieldErrors = validationFieldErrors(error);
    const known = Object.keys(fieldErrors).filter((field) => field in toDefaults());
    if (known.length > 0) {
      for (const field of known) {
        setError(field as keyof SchoolFormValues, { message: fieldErrors[field] });
      }
      return;
    }
    setFormError(schoolErrorMessage(error));
  };

  const onSubmit = handleSubmit(async (values) => {
    if (busy) return;
    setFormError(null);
    try {
      if (school) {
        await update.mutateAsync({ id: school.id, body: toInput(values) });
      } else {
        await create.mutateAsync({ code: values.code, ...toInput(values) });
      }
      toast.success(school ? 'Changes saved' : 'School created');
      onDone();
    } catch (error) {
      showError(error);
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
        fields={getSchoolFields(Boolean(school))}
        register={register}
        errors={errors}
        disabled={busy}
      />

      <div className="mt-2 flex justify-end gap-2 border-t border-gray-200 pt-4">
        <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save school'}
        </Button>
      </div>
    </form>
  );
}
