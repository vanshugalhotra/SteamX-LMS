import { Button } from '@/components/ui/button';
import { useLogout } from '../queries';

export function LogoutButton({ className }: { className?: string }) {
  const logout = useLogout();
  return (
    <Button
      variant="secondary"
      className={className}
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
          Signing out…
        </>
      ) : (
        'Sign out'
      )}
    </Button>
  );
}
