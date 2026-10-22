import { useNavigate } from 'react-router';
import { PATHS } from '@/lib/paths';
import { SchoolForm } from '../components/SchoolForm';
import { SchoolFormLayout } from '../components/SchoolFormLayout';

export function SchoolCreatePage() {
  const navigate = useNavigate();
  const backToList = () => {
    void navigate(PATHS.admin.schools);
  };

  return (
    <SchoolFormLayout
      title="Add new school"
      subtitle="Register a new school on the platform."
      tag="New"
    >
      <SchoolForm onDone={backToList} onCancel={backToList} />
    </SchoolFormLayout>
  );
}
