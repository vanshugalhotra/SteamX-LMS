import type { ReactNode } from 'react';

export function CourseHero({ children }: { children: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-brand-teal p-6 text-brand-navy lg:p-8">
      <span
        aria-hidden="true"
        className="absolute -right-10 -top-12 size-48 rounded-full bg-brand-coral"
      />
      <span
        aria-hidden="true"
        className="absolute right-28 top-14 hidden size-24 rounded-full bg-brand-sun sm:block"
      />
      <div className="relative">{children}</div>
    </section>
  );
}
