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
      Log out
    </Button>
  );
}