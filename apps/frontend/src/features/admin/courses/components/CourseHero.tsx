import type { ReactNode } from 'react';
import { BrandBackdrop } from '@/features/admin/components/BrandBackdrop';

export function CourseHero({ children }: { children: ReactNode }) {
  return (
    <BrandBackdrop className="rounded-3xl p-6 text-brand-navy lg:p-8">
      <div className="relative">{children}</div>
    </BrandBackdrop>
  );
}
