import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold whitespace-nowrap',
  {
    variants: {
      variant: {
        success: 'bg-teal-100 text-teal-800',
        warning: 'bg-yellow-100 text-yellow-800',
        danger: 'bg-magenta-100 text-magenta-800',
        neutral: 'bg-gray-100 text-gray-600',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

type BadgeProps = VariantProps<typeof badgeVariants> & { className?: string; children: ReactNode };

export function Badge({ variant, className, children }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>;
}
