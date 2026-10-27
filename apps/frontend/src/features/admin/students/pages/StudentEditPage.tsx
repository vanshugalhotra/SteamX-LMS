import { useNavigate, useParams } from 'react-router';
import { FormPageLayout } from '@/components/form/FormPageLayout';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import { useClassSection } from '../../class-sections/queries';
import { classSectionLabel } from '../../class-sections/model/types';
import { useSchoolNames } from '../../schools/queries';
import { useUser } from '../../users/queries';
import { StudentDirectory } from '../components/StudentDirectory';
import { StudentForm } from '../components/StudentForm';

export function StudentEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: user, isPending, error, refetch } = useUser(id);
  const classId = user?.profile?.classSectionId ?? '';
  const section = useClassSection(classId);
  const schoolNames = useSchoolNames();
  const backToList = () => {
    void navigate(PATHS.admin.students);
  };

  // A teacher's id must not open the student form.
  const notFound =
    (error instanceof ApiError && error.status === 404) ||
    (user !== undefined && user.userType !== 'STUDENT');
  const schoolName = user?.schoolId ? (schoolNames.get(user.schoolId) ?? '') : '';
  const classLabel = section.data ? classSectionLabel(section.data) : '';
  // Wait for the class label so the class field does not open empty.
  const loading = isPending || (classId !== '' && section.isPending);

  let content;
  if (loading) {
    content = (
      <div
        className="h-64 animate-pulse rounded-xl bg-gray-100"
        role="status"
        aria-label="Loading student"
      />
    );
  } else if (notFound) {
    content = <Alert>Student not found.</Alert>;
  } else if (error) {
    content = (
      <div className="space-y-3">
        <Alert>{getErrorMessage(error)}</Alert>
        <Button variant="secondary" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  } else {
    content = (
      // Remounts when the school or class name arrives so the fields show them.
      <StudentForm
        key={`${user.id}-${schoolName}-${classLabel}`}
        student={user}
        schoolName={schoolName}
        classLabel={classLabel}
        onDone={backToList}
        onCancel={backToList}
      />
    );
  }

  return (
    <FormPageLayout
      title="Edit student"
      subtitle="Update the student's details and account status."
      backTo={PATHS.admin.students}
      backLabel="Students"
      tag={user?.steamxId}
      tagVariant="warning"
      below={<StudentDirectory currentId={user?.id} />}
    >
      {content}
    </FormPageLayout>
  );
}
