import { Button } from '@/components/ui/button';
import { useLogout } from '../queries';
import { cn } from '@/lib/utils';

export function LogoutButton({ className }: { className?: string }) {
  const logout = useLogout();
  return (
    <Button
      variant="neo"
      className={cn(
        'border-0 bg-white text-gray-900 shadow-md hover:bg-gray-100 hover:translate-0',
        className,
      )}
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
