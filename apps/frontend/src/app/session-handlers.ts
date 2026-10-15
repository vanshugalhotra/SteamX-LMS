import { isPasswordChangeRequired } from '@/features/auth/errors';
import type { AuthProfile } from '@/features/auth/api';
import { AUTH_PATHS, SESSION_EXPIRED } from '@/features/auth/paths';
import { sessionQueryOptions } from '@/features/auth/queries';
import { setApiHandlers } from '@/lib/api-client';
import { toast } from 'sonner';
import { queryClient } from '@/lib/query-client';
import { router } from './router';

export function registerSessionHandlers() {
  setApiHandlers({
    onUnauthorized: () => {
      // Drop all cached user data, then SPA-navigate to /login with a "session expired" reason.
      queryClient.clear();
      queryClient.setQueryData(sessionQueryOptions.queryKey, null);
      if (router.state.location.pathname !== AUTH_PATHS.login) {
        void router.navigate(AUTH_PATHS.login, {
          replace: true,
          state: { reason: SESSION_EXPIRED },
        });
      }
    },
    onForbidden: (error) => {
      if (isPasswordChangeRequired(error)) {
        // The cached profile is stale; update it so changePasswordLoader doesn't bounce back to "/".
        queryClient.setQueryData<AuthProfile | null>(sessionQueryOptions.queryKey, (old) =>
          old ? { ...old, mustChangePassword: true } : old,
        );
        void router.navigate(AUTH_PATHS.changePassword, { replace: true });
        return;
      }
      // TODO: Revisit when role-based routing is in place.
      toast.error("You don't have access to this.");
    },
  });
}
