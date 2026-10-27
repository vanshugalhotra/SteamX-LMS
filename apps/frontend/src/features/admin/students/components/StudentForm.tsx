import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { FormRenderer } from '@/components/form/FormRenderer';
import { FormSection } from '@/components/form/FormSection';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  API_ERROR_CODE,
  getErrorMessage,
  getErrorMessages,
  getFieldErrors,
  hasErrorCode,
} from '@/lib/api-errors';
import type { User, UserStatus } from '../../users/model/types';
import { useCreateStudent, useUpdateUser, useUpdateUserStatus } from '../../users/queries';
import { getStudentFieldGroups } from '../config/students.config';
import { createStudentSchema, editStudentSchema, type StudentFormValues } from '../model/schemas';
import { Link } from 'react-router';
import { PATHS } from '@/lib/paths';

const toNull = (value: string) => (value === '' ? null : value);

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active', dotClass: 'bg-teal-500' },
  { value: 'INACTIVE', label: 'Inactive', dotClass: 'bg-magenta-500' },
] satisfies { value: UserStatus; label: string; dotClass: string }[];

function toDefaults(student?: User, schoolName = ''): StudentFormValues {
  return {
    name: student?.name ?? '',
    guardianName: student?.profile?.guardianName ?? '',
    classSectionId: student?.profile?.classSectionId ?? '',
    status: student?.status ?? 'ACTIVE',
    steamxId: student?.steamxId ?? '',
    schoolName,
    schoolId: student?.schoolId ?? '',
    password: '',
  };
}

interface StudentFormProps {
  /** Present when editing. */
  student?: User;
  schoolName?: string;
  classLabel?: string;
  onDone: () => void;
  onCancel: () => void;
}

export function StudentForm({
  student,
  schoolName,
  classLabel,
  onDone,
  onCancel,
}: StudentFormProps) {
  const create = useCreateStudent();
  const update = useUpdateUser();
  const updateStatus = useUpdateUserStatus();
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setFocus,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<StudentFormValues>({
    resolver: zodResolver(student ? editStudentSchema : createStudentSchema),
    defaultValues: toDefaults(student, schoolName),
  });

  // A class section belongs to one school, so choosing another school clears the class.
  const schoolId = useWatch({ control, name: 'schoolId' });
  useEffect(() => {
    if (!student) setValue('classSectionId', '');
  }, [schoolId, student, setValue]);

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
        setError(field as keyof StudentFormValues, { message: fieldErrors[field] });
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
      if (student) {
        await update.mutateAsync({
          id: student.id,
          // No email: the backend rejects it for students (FIELD_NOT_APPLICABLE).
          body: {
            name: values.name,
            guardianName: toNull(values.guardianName),
            classSectionId: values.classSectionId,
          },
        });
        if (values.status !== student.status) {
          try {
            await updateStatus.mutateAsync({ id: student.id, status: values.status });
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
          classSectionId: values.classSectionId,
          guardianName: toNull(values.guardianName),
          schoolId: values.schoolId,
        });
      }
      toast.success(student ? 'Changes saved' : 'Student created');
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

      <p className="mb-4 text-xs text-gray-600">
        No class sections yet?{' '}
        <Link to={PATHS.admin.classSectionNew} className="font-medium text-coral-700 underline">
          Create one
        </Link>
        .
      </p>

      {getStudentFieldGroups(Boolean(student), classLabel)
        .filter((group) => group.fields.length > 0 || (student && group.id === 'account'))
        .map((group) => (
          <FormSection key={group.id} title={group.title} accent={group.accent}>
            {group.fields.length > 0 && (
              <FormRenderer
                fields={group.fields}
                register={register}
                control={control}
                errors={errors}
                disabled={busy}
              />
            )}
            {student && group.id === 'account' && (
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <div className="mb-4.5 sm:w-1/2 sm:pr-2">
                    <SegmentedControl
                      label="Account status"
                      options={STATUS_OPTIONS}
                      value={field.value}
                      onChange={field.onChange}
                      disabled={busy}
                    />
                    <p className="mt-1.5 text-xs text-gray-600">
                      Inactive students cannot sign in.
                    </p>
                  </div>
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
            {busy ? 'Saving…' : student ? 'Save changes' : 'Create student'}
          </Button>
        </div>
      </div>
    </form>
  );
}
