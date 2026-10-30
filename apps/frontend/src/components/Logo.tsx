import { cn } from '@/lib/utils';
import logoMark from '@/assets/steamx-mark.png';
import logoWordmark from '@/assets/steamx-wordmark.png';

interface LogoProps {
  className?: string;
  accent?: 'white' | 'teal';
  variant?: 'compact' | 'wordmark';
}

export function Logo({ className, accent = 'teal', variant = 'wordmark' }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center', className)}>
      {variant === 'wordmark' && accent === 'teal' ? (
        <img
          className="h-auto w-52 max-w-full object-contain"
          src={logoWordmark}
          alt="SteamX, Curiosity to Creation"
        />
      ) : (
        <>
          <img className="size-8 flex-none object-contain" src={logoMark} alt="" />
          <span
            className={cn(
              'ml-2.5 text-xl font-semibold tracking-tight',
              accent === 'white' ? 'text-white' : 'text-gray-900',
            )}
          >
            SteamX
          </span>
        </>
      )}
    </span>
  );
}
