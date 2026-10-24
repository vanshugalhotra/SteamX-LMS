import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Native select styled like Input (accessible by default). */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-10.5 min-w-0 rounded-xl border border-input bg-white px-3.5 text-sm text-foreground outline-none',
        'hover:border-ring/50 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/30',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
