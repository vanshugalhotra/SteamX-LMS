import { useNavigate } from 'react-router';
import { FormPageLayout } from '@/components/form/FormPageLayout';
import { PATHS } from '@/lib/paths';
import { DeliveryForm } from '../components/DeliveryForm';

export function DeliveryCreatePage() {
  const navigate = useNavigate();
  const backToDirectory = () => {
    void navigate(PATHS.admin.deliveries);
  };

  return (
    <FormPageLayout
      title="Create delivery"
      subtitle="Assign an active course to a school for an academic year."
      backTo={PATHS.admin.deliveries}
      backLabel="Deliveries"
    >
      <DeliveryForm mode="create" onDone={backToDirectory} onCancel={backToDirectory} />
    </FormPageLayout>
  );
}
