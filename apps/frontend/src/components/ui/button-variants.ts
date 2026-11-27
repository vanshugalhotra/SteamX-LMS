import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition select-none outline-none focus-visible:ring-4 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:brightness-95 active:brightness-90',
        brand: 'bg-brand-navy text-white hover:bg-brand-navy/90 active:bg-brand-navy/80',
        secondary:
          'bg-secondary text-secondary-foreground hover:brightness-95 active:brightness-90',
        dark: 'bg-brand-navy text-white hover:bg-brand-navy/90 active:bg-brand-navy/80',
        outline: 'border border-gray-200 bg-white text-foreground hover:bg-gray-100',
        dangerOutline: 'border border-danger-line bg-white text-danger hover:bg-danger-soft',
        neo: 'border-2 border-ink bg-white text-ink shadow-[4px_4px_0_0_var(--color-ink)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0_0_var(--color-ink)]',
      },
      size: {
        sm: 'h-9 px-4 text-sm',
        default: 'h-11 px-6 text-sm',
        lg: 'h-14 px-8 text-base',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
