import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate, useLocation } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { AuthLayout } from '../components/AuthLayout';
import { getPostLoginPath, SESSION_EXPIRED } from '../model/redirects';
import { useLogin } from '../queries';
import { loginSchema, type LoginValues } from '../model/schemas';
import { getErrorMessage, type ErrorOverrides } from '@/lib/api-errors';
import { Spinner } from '@/components/ui/spinner';

const LOGIN_ERRORS: ErrorOverrides = {
  UNAUTHORIZED: 'We couldn’t sign you in. Check your SteamX ID and password, or ask your teacher.',
};

function isSessionExpired(state: unknown) {
  return (
    typeof state === 'object' &&
    state !== null &&
    'reason' in state &&
    state.reason === SESSION_EXPIRED
  );
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

  const location = useLocation();
  const sessionExpired = isSessionExpired(location.state);

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

      {sessionExpired && !login.isError && (
        <Alert className="mb-5">Your session has expired. Please sign in again.</Alert>
      )}

      {login.isError && (
        <Alert className="mb-5">{getErrorMessage(login.error, LOGIN_ERRORS)}</Alert>
      )}

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
              <Spinner />
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
