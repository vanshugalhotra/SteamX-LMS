import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { PATHS } from '@/lib/paths';

export function SchoolFormLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Link
        to={PATHS.admin.schools}
        className="inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-gray-600 outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/40"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to schools
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">{title}</h1>
      <div className="mt-6 max-w-3xl rounded-2xl bg-white p-5 shadow-sm lg:p-6">{children}</div>
    </>
  );
}
