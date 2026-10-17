import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import type { School, SchoolInput } from '../api/api';
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
}

export function SchoolForm({ school, onDone }: SchoolFormProps) {
  const create = useCreateSchool();
  const update = useUpdateSchool();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<SchoolFormValues>({
    resolver: zodResolver(school ? editSchoolSchema : createSchoolSchema),
    defaultValues: toDefaults(school),
  });

  const busy = create.isPending || update.isPending;

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

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    const callbacks = {
      onSuccess: () => {
        toast.success(school ? 'Changes saved' : 'School created');
        onDone();
      },
      onError: showError,
    };
    if (school) {
      update.mutate({ id: school.id, body: toInput(values) }, callbacks);
    } else {
      create.mutate({ code: values.code, ...toInput(values) }, callbacks);
    }
  });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {formError && <Alert className="mb-5">{formError}</Alert>}

        <FormField label="School name *" error={errors.name?.message}>
          {(control) => (
            <Input {...control} {...register('name')} autoComplete="off" disabled={busy} />
          )}
        </FormField>

        <FormField
          label={school ? 'School code (cannot be changed)' : 'School code *'}
          error={errors.code?.message}
        >
          {(control) => (
            <Input
              {...control}
              {...register('code')}
              readOnly={Boolean(school)}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="e.g. AB-12"
              disabled={busy}
            />
          )}
        </FormField>

        <div className="grid gap-x-3 sm:grid-cols-2">
          <FormField label="City *" error={errors.city?.message}>
            {(control) => <Input {...control} {...register('city')} disabled={busy} />}
          </FormField>
          <FormField label="State *" error={errors.state?.message}>
            {(control) => <Input {...control} {...register('state')} disabled={busy} />}
          </FormField>
          <FormField label="Postal code *" error={errors.postalCode?.message}>
            {(control) => <Input {...control} {...register('postalCode')} disabled={busy} />}
          </FormField>
          <FormField label="Country *" error={errors.country?.message}>
            {(control) => <Input {...control} {...register('country')} disabled={busy} />}
          </FormField>
        </div>

        <FormField label="Street address" error={errors.streetAddress?.message}>
          {(control) => <Input {...control} {...register('streetAddress')} disabled={busy} />}
        </FormField>

        <div className="grid gap-x-3 sm:grid-cols-2">
          <FormField label="Contact name" error={errors.contactName?.message}>
            {(control) => <Input {...control} {...register('contactName')} disabled={busy} />}
          </FormField>
          <FormField label="Contact phone" error={errors.contactPhone?.message}>
            {(control) => (
              <Input {...control} {...register('contactPhone')} type="tel" disabled={busy} />
            )}
          </FormField>
        </div>

        <FormField label="Contact email" error={errors.contactEmail?.message}>
          {(control) => (
            <Input
              {...control}
              {...register('contactEmail')}
              type="email"
              autoComplete="off"
              disabled={busy}
            />
          )}
        </FormField>
      </div>

      <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
        <Button type="button" variant="secondary" disabled={busy} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save school'}
        </Button>
      </div>
    </form>
  );
}
