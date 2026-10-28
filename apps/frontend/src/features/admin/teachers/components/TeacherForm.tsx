import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormRenderer } from '@/components/form/FormRenderer';
import { FormSection } from '@/components/form/FormSection';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  API_ERROR_CODE,
  getErrorMessage,
  getErrorMessages,
  getFieldErrors,
  hasErrorCode,
} from '@/lib/api-errors';
import type { User } from '../../users/model/types';
import { useCreateTeacher, useUpdateUser, useUpdateUserStatus } from '../../users/queries';
import { UserStatusSection } from '../../users/components/UserStatusSection';
import { getTeacherFieldGroups } from '../config/teachers.config';
import { createTeacherSchema, editTeacherSchema, type TeacherFormValues } from '../model/schemas';

const toNull = (value: string) => (value === '' ? null : value);

function toDefaults(teacher?: User, schoolName = ''): TeacherFormValues {
  return {
    name: teacher?.name ?? '',
    email: teacher?.email ?? '',
    primaryAssignment: teacher?.profile?.primaryAssignment ?? '',
    status: teacher?.status ?? 'ACTIVE',
    steamxId: teacher?.steamxId ?? '',
    schoolName,
    schoolId: teacher?.schoolId ?? '',
    password: '',
  };
}

interface TeacherFormProps {
  /** Present when editing. */
  teacher?: User;
  schoolName?: string;
  onDone: () => void;
  onCancel: () => void;
}

export function TeacherForm({ teacher, schoolName, onDone, onCancel }: TeacherFormProps) {
  const create = useCreateTeacher();
  const update = useUpdateUser();
  const updateStatus = useUpdateUserStatus();
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<TeacherFormValues>({
    resolver: zodResolver(teacher ? editTeacherSchema : createTeacherSchema),
    defaultValues: toDefaults(teacher, schoolName),
  });

  const busy = isSubmitting || create.isPending || update.isPending || updateStatus.isPending;

  const showError = (error: unknown) => {
    if (
      hasErrorCode(error, API_ERROR_CODE.SCHOOL_REQUIRED) ||
      hasErrorCode(error, API_ERROR_CODE.SCHOOL_INACTIVE)
    ) {
      setError('schoolId', { message: getErrorMessage(error) });
      setFocus('schoolId');
      return;
    }
    const fieldErrors = getFieldErrors(error);
    const known = Object.keys(fieldErrors).filter((field) => field in toDefaults());
    if (known.length > 0) {
      for (const field of known) {
        setError(field as keyof TeacherFormValues, { message: fieldErrors[field] });
      }
      return;
    }
    // Includes password policy violations, one line per broken rule.
    setFormErrors(getErrorMessages(error));
  };

  const onSubmit = handleSubmit(async (values) => {
    if (busy) return;
    setFormErrors([]);
    try {
      if (teacher) {
        await update.mutateAsync({
          id: teacher.id,
          body: {
            name: values.name,
            email: toNull(values.email),
            primaryAssignment: toNull(values.primaryAssignment),
          },
        });
        if (values.status !== teacher.status) {
          try {
            await updateStatus.mutateAsync({ id: teacher.id, status: values.status });
          } catch (error) {
            // Details are already saved; only the status change failed.
            setFormErrors([
              `Details saved, but the status was not changed. ${getErrorMessage(error)}`,
            ]);
            return;
          }
        }
      } else {
        await create.mutateAsync({
          name: values.name,
          password: values.password,
          email: toNull(values.email),
          primaryAssignment: toNull(values.primaryAssignment),
          schoolId: values.schoolId,
        });
      }
      toast.success(teacher ? 'Changes saved' : 'Teacher created');
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
      {formErrors.length > 0 && (
        <Alert className="mb-5">
          {formErrors.length === 1 ? (
            formErrors[0]
          ) : (
            <ul className="list-disc pl-4">
              {formErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      {getTeacherFieldGroups(Boolean(teacher))
        .filter((group) => group.fields.length > 0 || (teacher && group.id === 'account'))
        .map((group) => (
          <FormSection key={group.id} title={group.title} accent={group.accent}>
            {group.fields.length > 0 && (
              <FormRenderer
                fields={group.fields}
                register={register}
                errors={errors}
                disabled={busy}
                control={control}
              />
            )}
            {teacher && group.id === 'account' && (
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <UserStatusSection
                    plural="teachers"
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
            {busy ? 'Saving…' : teacher ? 'Save changes' : 'Create teacher'}
          </Button>
        </div>
      </div>
    </form>
  );
}
