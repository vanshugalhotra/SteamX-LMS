import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function BrandBackdrop({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('relative isolate overflow-hidden bg-brand-teal', className)}>
      <span
        aria-hidden="true"
        className="absolute -right-10 -top-12 size-48 rounded-full bg-brand-coral"
      />
      <span
        aria-hidden="true"
        className="absolute right-28 top-14 hidden size-24 rounded-full bg-brand-sun sm:block"
      />
      {children}
    </div>
  );
}
