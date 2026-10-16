import { isPasswordChangeRequired } from '@/features/auth/model/errors';
import type { AuthProfile } from '@/features/auth/api/api';
import { SESSION_EXPIRED } from '@/features/auth/model/redirects';
import { PATHS } from '@/lib/paths';
import { clearSession, sessionQueryOptions } from '@/features/auth/queries';
import { setApiHandlers } from '@/lib/api-client';
import { toast } from 'sonner';
import { queryClient } from '@/lib/query-client';
import { router } from './router';

export function registerSessionHandlers() {
  setApiHandlers({
    onUnauthorized: () => {
      // SPA navigation instead of a full page reload: lets us pass the "session expired"
      // reason through router state, avoids a page flash, and keeps the router and Toaster mounted.
      clearSession(queryClient);
      if (router.state.location.pathname !== PATHS.login) {
        void router.navigate(PATHS.login, {
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
        void router.navigate(PATHS.changePassword, { replace: true });
        return;
      }
      // TODO: Revisit when role-based routing is in place.
      toast.error("You don't have access to this.", { id: 'forbidden' });
    },
  });
}
