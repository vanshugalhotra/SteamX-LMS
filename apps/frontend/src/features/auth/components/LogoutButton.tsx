import { Button } from '@/components/ui/button';
import { useLogout } from '../queries';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

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
          <Spinner />
          Signing out…
        </>
      ) : (
        'Sign out'
      )}
    </Button>
  );
}
