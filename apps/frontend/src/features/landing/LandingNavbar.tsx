import { Link } from 'react-router';
import { Logo } from '@/components/Logo';
import { ButtonLink } from '@/components/ui/button-link';

const navButton = 'h-9 rounded-full px-4 md:h-11 md:px-6';

export function LandingNavbar() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <Link to="/" aria-label="SteamX home">
        <Logo />
      </Link>
      <nav aria-label="Main" className="flex items-center gap-2 md:gap-3">
        <ButtonLink to="/login" variant="dark" className={navButton}>
          Log in
        </ButtonLink>
        <ButtonLink to="/contact" variant="secondary" className={navButton}>
          Contact Us
        </ButtonLink>
      </nav>
    </header>
  );
}