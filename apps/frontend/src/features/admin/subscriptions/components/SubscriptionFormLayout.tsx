import type { ReactNode } from 'react';
import { FormPageLayout } from '@/components/form/FormPageLayout';
import { PATHS } from '@/lib/paths';

interface SubscriptionFormLayoutProps {
  title: string;
  subtitle: string;
  backLabel?: string;
  children: ReactNode;
}

export function SubscriptionFormLayout({
  title,
  subtitle,
  backLabel = 'Subscriptions',
  children,
}: SubscriptionFormLayoutProps) {
  return (
    <FormPageLayout
      title={title}
      subtitle={subtitle}
      backTo={PATHS.admin.subscriptions}
      backLabel={backLabel}
    >
      {children}
    </FormPageLayout>
  );
}
