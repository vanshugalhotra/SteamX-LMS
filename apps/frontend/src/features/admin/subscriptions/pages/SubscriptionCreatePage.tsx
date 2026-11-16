import { useNavigate } from 'react-router';
import { PATHS } from '@/lib/paths';
import { SubscriptionForm } from '../components/SubscriptionForm';
import { SubscriptionFormLayout } from '../components/SubscriptionFormLayout';

export function SubscriptionCreatePage() {
  const navigate = useNavigate();
  const backToDirectory = () => {
    void navigate(PATHS.admin.subscriptions);
  };

  return (
    <SubscriptionFormLayout
      title="New subscription"
      subtitle="Grant a school access to an active course for a defined term."
    >
      <SubscriptionForm onDone={backToDirectory} onCancel={backToDirectory} />
    </SubscriptionFormLayout>
  );
}
