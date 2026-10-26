import { useNavigate } from 'react-router';
import { FormPageLayout } from '@/components/form/FormPageLayout';
import { PATHS } from '@/lib/paths';
import { StudentDirectory } from '../components/StudentDirectory';
import { StudentForm } from '../components/StudentForm';

export function StudentCreatePage() {
  const navigate = useNavigate();
  const backToList = () => {
    void navigate(PATHS.admin.students);
  };

  return (
    <FormPageLayout
      title="Add new student"
      subtitle="Create a student account for a school."
      backTo={PATHS.admin.students}
      backLabel="Students"
      tag="New"
      below={<StudentDirectory />}
    >
      <StudentForm onDone={backToList} onCancel={backToList} />
    </FormPageLayout>
  );
}
