import { Button } from '@/components/ui/button';
import { useLogout } from '../queries';

export function LogoutButton() {
  const logout = useLogout();
  return (
    <Button
      variant="secondary"
      disabled={logout.isPending}
      onClick={() => {
        logout.mutate();
      }}
    >
      {logout.isPending ? (
        <>
          <span
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
          Logging out…
        </>
      ) : (
        'Log out'
      )}
    </Button>
  );
}
