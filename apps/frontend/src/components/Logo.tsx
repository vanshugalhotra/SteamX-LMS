import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  accent?: 'white' | 'teal';
}

export function Logo({ className, accent = 'white' }: LogoProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2.5 text-xl font-semibold tracking-tight text-gray-900',
        className,
      )}
    >
      <span aria-hidden className="relative h-7.5 w-8.5 flex-none">
        <i className="absolute bottom-0 left-0 size-5.5 rounded-full bg-coral-500" />
        <i
          className={cn(
            'absolute top-0 right-0 size-4 rounded-full',
            accent === 'teal' ? 'bg-teal-500 outline-2 outline-white' : 'bg-white',
          )}
        />
      </span>
      SteamX
    </span>
  );
}
