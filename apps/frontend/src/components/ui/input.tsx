import { Input as InputPrimitive } from '@base-ui/react/input';
import { cn } from '@/lib/utils';

type InputProps = Omit<InputPrimitive.Props, 'className'> & { className?: string };

export function Input({ className, ...props }: InputProps) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(
        'h-12.5 w-full rounded-xl border-[1.5px] border-transparent bg-gray-100 px-4 text-sm text-foreground transition outline-none',
        'placeholder:text-gray-400 hover:border-gray-200',
        'focus-visible:border-teal-500 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-ring/30',
        'aria-invalid:border-danger-line aria-invalid:bg-danger-soft',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
