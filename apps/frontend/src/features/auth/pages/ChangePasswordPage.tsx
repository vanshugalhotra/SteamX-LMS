import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { PasswordInput } from '@/components/ui/password-input';
import { ApiError } from '@/lib/api-client';
import { queryClient } from '@/lib/query-client';
import { changePassword } from '../api/api';
import { AuthLayout } from '../components/AuthLayout';
import {
  INVALID_CURRENT_PASSWORD,
  PASSWORD_POLICY,
  PASSWORD_REUSED,
  policyMessages,
} from '../model/errors';
import { AUTH_PATHS } from '../model/paths';
import { sessionQueryOptions } from '../queries';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(1, 'Enter a new password'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

function getErrorMessages(error: unknown): string[] {
  if (!(error instanceof ApiError)) return ['Something went wrong. Please try again.'];
  switch (error.code) {
    case PASSWORD_POLICY:
      return policyMessages(error.details);
    case INVALID_CURRENT_PASSWORD:
      return ['Your current password is incorrect.'];
    case PASSWORD_REUSED:
      return ['Your new password must be different from your current password.'];
    default:
      return [error.message];
  }
}

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const [errorMessages, setErrorMessages] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setErrorMessages([]);
    try {
      const profile = await changePassword({ currentPassword, newPassword });
      queryClient.setQueryData(sessionQueryOptions.queryKey, profile);
      await navigate(AUTH_PATHS.afterLogin, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return;
      setErrorMessages(getErrorMessages(error));
    }
  });

  return (
    <AuthLayout>
      <h1 className="text-2xl leading-tight font-semibold tracking-tight min-[600px]:text-[28px]">
        Set a new password
      </h1>
      <p className="mt-2 mb-7 max-w-[36ch] text-gray-600">
        You need to change your password before continuing.
      </p>

      {errorMessages.length > 0 && (
        <Alert className="mb-5">
          {errorMessages.length === 1 ? (
            errorMessages[0]
          ) : (
            <ul className="list-disc pl-4">
              {errorMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          void onSubmit(e);
        }}
      >
        <FormField label="Current password" error={errors.currentPassword?.message}>
          {(control) => (
            <PasswordInput
              {...control}
              {...register('currentPassword')}
              className="bg-gray-100"
              autoComplete="current-password"
              placeholder="Enter your current password"
              disabled={isSubmitting}
            />
          )}
        </FormField>

        <FormField label="New password" error={errors.newPassword?.message}>
          {(control) => (
            <PasswordInput
              {...control}
              {...register('newPassword')}
              className="bg-gray-100"
              autoComplete="new-password"
              placeholder="Enter a new password"
              disabled={isSubmitting}
            />
          )}
        </FormField>

        <FormField label="Confirm new password" error={errors.confirmPassword?.message}>
          {(control) => (
            <PasswordInput
              {...control}
              {...register('confirmPassword')}
              className="bg-gray-100"
              autoComplete="new-password"
              placeholder="Re-enter your new password"
              disabled={isSubmitting}
            />
          )}
        </FormField>

        <Button
          type="submit"
          size="lg"
          className="mt-1.5 w-full shadow-lg shadow-coral-700/25"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <span
                className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
              Saving…
            </>
          ) : (
            'Change password'
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
