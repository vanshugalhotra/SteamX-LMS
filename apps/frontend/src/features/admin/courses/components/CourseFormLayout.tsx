import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { PATHS } from '@/lib/paths';

interface CourseFormLayoutProps {
  title: string;
  subtitle: string;
  backLabel?: string;
  children: ReactNode;
}

export function CourseFormLayout({
  title,
  subtitle,
  backLabel = 'All courses',
  children,
}: CourseFormLayoutProps) {
  return (
    <div className="space-y-5">
      <Link
        to={PATHS.admin.courses}
        className="inline-flex items-center gap-1.5 rounded text-xs font-medium text-gray-600 outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/40"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        {backLabel}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
