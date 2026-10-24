import { useNavigate } from 'react-router';
import { FormPageLayout } from '@/components/form/FormPageLayout';
import { PATHS } from '@/lib/paths';
import { TeacherForm } from '../components/TeacherForm';
import { TeacherDirectory } from '../components/TeacherDirectory';

export function TeacherCreatePage() {
  const navigate = useNavigate();
  const backToList = () => {
    void navigate(PATHS.admin.teachers);
  };

  return (
    <FormPageLayout
      title="Add new teacher"
      subtitle="Create a teacher account for a school."
      backTo={PATHS.admin.teachers}
      backLabel="Teachers"
      tag="New"
      below={<TeacherDirectory />}
    >
      <TeacherForm onDone={backToList} onCancel={backToList} />
    </FormPageLayout>
  );
}
