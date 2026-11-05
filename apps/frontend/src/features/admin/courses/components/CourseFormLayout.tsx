import type { ReactNode } from 'react';
import { BackLink } from '@/components/ui/back-link';
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
      <BackLink to={PATHS.admin.courses}>{backLabel}</BackLink>
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
