import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type TextareaProps = ComponentProps<'textarea'>;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'w-full rounded-xl border-[1.5px] border-input bg-white px-4 py-3 text-sm text-foreground transition outline-none',
        'placeholder:text-muted-foreground hover:border-ring/50',
        'focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/30',
        'aria-invalid:border-danger-line aria-invalid:bg-danger-soft',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
