import type { ReactNode } from 'react';
import { useId } from 'react';

const DOTS = {
  coral: 'bg-coral-500',
  teal: 'bg-teal-500',
  yellow: 'bg-yellow-500',
} as const;

export type FormSectionAccent = keyof typeof DOTS;

export function FormSection({
  title,
  accent,
  children,
}: {
  title: string;
  accent: FormSectionAccent;
  children: ReactNode;
}) {
  const titleId = useId();

  return (
    <div role="group" aria-labelledby={titleId} className="mb-4 min-w-0">
      <div className="mb-3 flex items-center gap-2.5">
        <span aria-hidden="true" className={`size-2 rounded-full ${DOTS[accent]}`} />
        <h2 id={titleId} className="text-[15px] font-semibold">
          {title}
        </h2>
        <span aria-hidden="true" className="h-px flex-1 bg-gray-200" />
      </div>
      {children}
    </div>
  );
}
