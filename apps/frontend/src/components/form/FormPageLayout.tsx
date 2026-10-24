import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';

interface FormPageLayoutProps {
  title: string;
  subtitle: string;
  /** Where "Back" and the breadcrumb go. */
  backTo: string;
  backLabel: string;
  tag?: string;
  tagVariant?: 'success' | 'warning';
  children: ReactNode;
  /** Extra content below the form card (e.g. the school directory). */
  below?: ReactNode;
}

export function FormPageLayout({
  title,
  subtitle,
  backTo,
  backLabel,
  tag,
  tagVariant = 'success',
  children,
  below,
}: FormPageLayoutProps) {
  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-gray-600">
          <Link
            to={backTo}
            className="rounded outline-none hover:text-foreground hover:underline focus-visible:ring-4 focus-visible:ring-ring/40"
          >
            {backLabel}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="font-medium">{title}</span>
        </nav>
        <Link
          to={backTo}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium outline-none hover:text-coral-700 focus-visible:ring-4 focus-visible:ring-ring/40"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to {backLabel.toLowerCase()}
        </Link>
        <h1 className="mt-4 flex flex-wrap items-center gap-3 text-2xl leading-tight font-bold">
          {title}
          {tag && <Badge variant={tagVariant}>{tag}</Badge>}
        </h1>
        <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
      </div>
      <section className="rounded-2xl border border-gray-200 bg-white p-5 lg:p-6">
        {children}
      </section>
      {below}
    </div>
  );
}
