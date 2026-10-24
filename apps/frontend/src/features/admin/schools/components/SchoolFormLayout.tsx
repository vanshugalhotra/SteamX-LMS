import type { ReactNode } from 'react';
import { PATHS } from '@/lib/paths';
import { SchoolDirectory } from './SchoolDirectory';
import { FormPageLayout } from '@/components/form/FormPageLayout';

export function SchoolFormLayout(props: {
  title: string;
  subtitle: string;
  tag?: string;
  tagVariant?: 'success' | 'warning';
  children: ReactNode;
}) {
  return (
    <FormPageLayout
      {...props}
      backTo={PATHS.admin.schools}
      backLabel="Schools"
      below={<SchoolDirectory />}
    />
  );
}
