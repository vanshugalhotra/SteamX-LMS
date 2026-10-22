import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormRenderer } from '@/components/form/FormRenderer';
import { FormSection } from '@/components/form/FormSection';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { API_ERROR_CODE, getErrorMessage, getFieldErrors, hasErrorCode } from '@/lib/api-errors';
import { getSchoolFieldGroups } from '../config/schools.config';
import { createSchoolSchema, editSchoolSchema, type SchoolFormValues } from '../model/schemas';
import type { School, SchoolInput } from '../model/types';
import { useCreateSchool, useUpdateSchool, useUpdateSchoolStatus } from '../queries';
import { SchoolStatusSection } from './SchoolStatusSection';

const toNull = (value: string) => (value === '' ? null : value);

function toInput(values: SchoolFormValues): SchoolInput {
  return {
    name: values.name,
    city: values.city,
    state: values.state,
    postalCode: values.postalCode,
    country: values.country,
    // The API rejects empty strings for optional fields; null clears them.
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
    status: school?.status ?? 'ACTIVE',
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
  const updateStatus = useUpdateSchoolStatus();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<SchoolFormValues>({
    resolver: zodResolver(school ? editSchoolSchema : createSchoolSchema),
    defaultValues: toDefaults(school),
  });

  const busy = isSubmitting || create.isPending || update.isPending || updateStatus.isPending;

  const showError = (error: unknown) => {
    if (hasErrorCode(error, API_ERROR_CODE.SCHOOL_CODE_EXISTS)) {
      setError('code', { message: getErrorMessage(error) });
      setFocus('code');
      return;
    }
    const fieldErrors = getFieldErrors(error);
    const known = Object.keys(fieldErrors).filter((field) => field in toDefaults());
    if (known.length > 0) {
      for (const field of known) {
        setError(field as keyof SchoolFormValues, { message: fieldErrors[field] });
      }
      return;
    }
    setFormError(getErrorMessage(error));
  };

  const onSubmit = handleSubmit(async (values) => {
    if (busy) return;
    setFormError(null);
    try {
      if (school) {
        await update.mutateAsync({ id: school.id, body: toInput(values) });
        if (values.status !== school.status) {
          try {
            await updateStatus.mutateAsync({ id: school.id, status: values.status });
          } catch (error) {
            // Details are already saved; only the status change failed.
            setFormError(
              `Details saved, but the status was not changed. ${getErrorMessage(error)}`,
            );
            return;
          }
        }
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

      {getSchoolFieldGroups(Boolean(school)).map((group, index) => (
        <FormSection key={group.id} title={group.title} accent={group.accent}>
          <FormRenderer fields={group.fields} register={register} errors={errors} disabled={busy} />
          {index === 0 && school && (
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <SchoolStatusSection
                  value={field.value}
                  onChange={field.onChange}
                  disabled={busy}
                />
              )}
            />
          )}
        </FormSection>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-5">
        <p className="text-xs text-gray-600">
          <span className="text-coral-600">*</span> Required fields
        </p>
        <div className="ml-auto flex gap-3">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : school ? 'Save changes' : 'Create school'}
          </Button>
        </div>
      </div>
    </form>
  );
}
