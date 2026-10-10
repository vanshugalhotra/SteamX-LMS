import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2.5 text-xl font-semibold tracking-tight text-gray-900',
        className,
      )}
    >
      <span aria-hidden className="relative h-7.5 w-8.5 flex-none">
        <i className="absolute bottom-0 left-0 size-5.5 rounded-full bg-coral-500" />
        <i className="absolute top-0 right-0 size-4 rounded-full bg-white" />
      </span>
      SteamX
    </span>
  );
}
