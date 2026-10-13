import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';
import { AUTH_PATHS } from '@/features/auth/paths';
import { buttonVariants } from '@/components/ui/button-variants';

export function RootFallback() {
  return (
    <div className="grid min-h-screen place-items-center" role="status" aria-label="Loading">
      <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-ring" />
    </div>
  );
}

export function RootError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? error.statusText || 'Something went wrong.'
    : 'Something went wrong.';

  return (
    <div role="alert" className="grid min-h-screen place-items-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="mb-2 text-lg font-semibold">{message}</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Please try again. If the problem continues, go back to login.
        </p>
        <div className="flex justify-center gap-3">
          <Button
            onClick={() => {
              window.location.reload();
            }}
          >
            Try again
          </Button>
          <a href={AUTH_PATHS.login} className={buttonVariants({ variant: 'secondary' })}>
            Back to login
          </a>
        </div>
      </div>
    </div>
  );
}
