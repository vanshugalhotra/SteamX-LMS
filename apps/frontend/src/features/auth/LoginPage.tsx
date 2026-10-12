import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { ApiError } from '@/lib/api-client';
import { AuthLayout } from './components/AuthLayout';
import { getPostLoginPath } from './paths';
import { useLogin } from './queries';
import { loginSchema, type LoginValues } from './schemas';

function getLoginErrorMessage(error: Error) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'We couldn’t sign you in. Check your SteamX ID and password, or ask your teacher.';
    }
    if (error.status === 429) return 'Too many attempts. Please wait a minute and try again.';
    if (error.status === 0) return error.message; // network error
  }
  return 'Something went wrong on our side. Please try again.';
}

export function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { steamxId: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: (profile) => {
        void navigate(getPostLoginPath(profile), { replace: true });
      },
    });
  });

  const busy = login.isPending;

  return (
    <AuthLayout>
      <h1 className="text-2xl leading-tight font-semibold tracking-tight min-[600px]:text-[28px]">
        Welcome back
      </h1>
      <p className="mt-2 mb-7 max-w-[36ch] text-gray-600">
        Sign in with the SteamX ID and password your teacher gave you.
      </p>

      {login.isError && <Alert className="mb-5">{getLoginErrorMessage(login.error)}</Alert>}

      <form
        noValidate
        onSubmit={(e) => {
          void onSubmit(e);
        }}
      >
        <FormField label="SteamX ID" error={errors.steamxId?.message}>
          {(control) => (
            <Input
              {...control}
              {...register('steamxId')}
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Enter your SteamX ID"
              disabled={busy}
            />
          )}
        </FormField>

        <FormField label="Password" error={errors.password?.message}>
          {(control) => (
            <PasswordInput
              {...control}
              {...register('password')}
              autoComplete="current-password"
              placeholder="Enter your password"
              disabled={busy}
            />
          )}
        </FormField>

        <Button
          type="submit"
          size="lg"
          className="mt-1.5 w-full shadow-lg shadow-coral-700/25"
          disabled={busy}
        >
          {busy ? (
            <>
              <span
                className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>

      <p className="mt-5.5 border-t border-gray-200 pt-4.5 text-[13px] text-gray-600">
        Need help signing in? Ask your teacher.
      </p>
    </AuthLayout>
  );
}
