import { useState, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { Input } from './input';

type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'type'>;

export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={cn('pr-12', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => {
          setVisible((v) => !v);
        }}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute top-1.75 right-1.75 grid size-9 place-items-center rounded-[10px] text-gray-600 transition outline-none hover:bg-gray-200 focus-visible:ring-4 focus-visible:ring-ring/40"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {visible ? (
            <path d="M3 3l18 18M10.6 6.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4M6.5 6.8C3.6 8.6 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.2-1" />
          ) : (
            <>
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
