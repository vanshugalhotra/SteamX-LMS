import { cn } from '@/lib/utils';
import logoLockup from '@/assets/steamx-lockup.png';
import logoWordmark from '@/assets/steamx-wordmark.png';

interface LogoProps {
  className?: string;
  accent?: 'white' | 'teal';
  variant?: 'compact' | 'wordmark';
}

export function Logo({ className, accent = 'teal', variant = 'wordmark' }: LogoProps) {
  const showWordmark = variant === 'wordmark' && accent === 'teal';
  return (
    <span className={cn('inline-flex items-center', className)}>
      {showWordmark ? (
        <img
          className="h-auto w-52 max-w-full object-contain"
          src={logoWordmark}
          alt="SteamX, Curiosity to Creation"
        />
      ) : (
        <img className="h-15 w-auto flex-none object-contain" src={logoLockup} alt="SteamX" />
      )}
    </span>
  );
}
