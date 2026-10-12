import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-snug',
  {
    variants: {
      variant: {
        error: 'border-danger-line bg-danger-soft text-danger',
        success: 'border-success-line bg-success-soft text-success',
      },
    },
    defaultVariants: { variant: 'error' },
  },
);

type AlertProps = VariantProps<typeof alertVariants> & { className?: string; children: ReactNode };

export function Alert({ variant, className, children }: AlertProps) {
  const isSuccess = variant === 'success';

  return (
    <div
      role={isSuccess ? 'status' : 'alert'}
      className={cn(alertVariants({ variant }), className)}
    >
      <svg
        className="mt-0.5 size-4.5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        {isSuccess ? <path d="M8 12.5l3 3 5-6" /> : <path d="M12 7.5v5.5M12 16.5v.01" />}
      </svg>
      <div>{children}</div>
    </div>
  );
}
