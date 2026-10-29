import { useNavigate } from 'react-router';
import { FormPageLayout } from '@/components/form/FormPageLayout';
import { PATHS } from '@/lib/paths';
import { ClassSectionForm } from '../components/ClassSectionForm';

export function ClassSectionCreatePage() {
  const navigate = useNavigate();
  const backToList = () => {
    void navigate(PATHS.admin.classSections);
  };

  return (
    <FormPageLayout
      title="Add class section"
      subtitle="Create a class (and optionally a section) inside a school."
      backTo={PATHS.admin.classSections}
      backLabel="Class sections"
      tag="New"
    >
      <ClassSectionForm onDone={backToList} onCancel={backToList} />
    </FormPageLayout>
  );
}
