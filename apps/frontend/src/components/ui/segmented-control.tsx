import { useId } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Tailwind class for the small dot when this option is selected. */
  dotClass?: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: SegmentedControlProps<T>) {
  const labelId = useId();

  return (
    <div>
      <p id={labelId} className="mb-1.5 text-xs font-medium">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid h-10.5 grid-cols-2 gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => {
                onChange(option.value);
              }}
              className={cn(
                'flex items-center justify-center gap-2 rounded-lg text-[13px] font-medium text-gray-600 outline-none focus-visible:ring-4 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60',
                selected && 'bg-white text-foreground shadow-sm',
              )}
            >
              <span
                aria-hidden="true"
                className={cn('size-2 rounded-full bg-gray-400', selected && option.dotClass)}
              />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
