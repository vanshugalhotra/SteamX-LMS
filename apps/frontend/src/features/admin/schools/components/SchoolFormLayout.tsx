import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { PATHS } from '@/lib/paths';
import { SchoolDirectory } from './SchoolDirectory';

interface SchoolFormLayoutProps {
  title: string;
  subtitle: string;
  /** Small tag next to the title: "New" or the school code. */
  tag?: string;
  tagVariant?: 'success' | 'warning';
  children: ReactNode;
}

export function SchoolFormLayout({
  title,
  subtitle,
  tag,
  tagVariant = 'success',
  children,
}: SchoolFormLayoutProps) {
  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-gray-600">
          <Link
            to={PATHS.admin.schools}
            className="rounded outline-none hover:text-foreground hover:underline focus-visible:ring-4 focus-visible:ring-ring/40"
          >
            Schools
          </Link>
          <span aria-hidden="true">/</span>
          <span className="font-medium">{title}</span>
        </nav>

        <Link
          to={PATHS.admin.schools}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium outline-none hover:text-coral-700 focus-visible:ring-4 focus-visible:ring-ring/40"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to schools
        </Link>

        <h1 className="mt-4 flex flex-wrap items-center gap-3 text-[28px] leading-tight font-bold">
          {title}
          {tag && <Badge variant={tagVariant}>{tag}</Badge>}
        </h1>
        <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 lg:p-6">
        {children}
      </section>

      <SchoolDirectory />
    </div>
  );
}
