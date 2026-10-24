import { useNavigate, useParams } from 'react-router';
import { FormPageLayout } from '@/components/form/FormPageLayout';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import { useSchoolNames } from '../../schools/queries';
import { useUser } from '../../users/queries';
import { TeacherForm } from '../components/TeacherForm';

export function TeacherEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: user, isPending, error, refetch } = useUser(id);
  const schoolNames = useSchoolNames();
  const backToList = () => {
    void navigate(PATHS.admin.teachers);
  };

  // A student's id must not open the teacher form.
  const notFound =
    (error instanceof ApiError && error.status === 404) ||
    (user !== undefined && user.userType !== 'SCHOOL_STAFF');
  const schoolName = user?.schoolId ? (schoolNames.get(user.schoolId) ?? '') : '';

  let content;
  if (isPending) {
    content = (
      <div
        className="h-64 animate-pulse rounded-xl bg-gray-100"
        role="status"
        aria-label="Loading teacher"
      />
    );
  } else if (notFound) {
    content = <Alert>Teacher not found.</Alert>;
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
      // Remounts when the school name arrives so the read-only field shows it.
      <TeacherForm
        key={`${user.id}-${schoolName}`}
        teacher={user}
        schoolName={schoolName}
        onDone={backToList}
        onCancel={backToList}
      />
    );
  }

  return (
    <FormPageLayout
      title="Edit teacher"
      subtitle="Update the teacher's details and account status."
      backTo={PATHS.admin.teachers}
      backLabel="Teachers"
      tag={user?.steamxId}
      tagVariant="warning"
    >
      {content}
    </FormPageLayout>
  );
}
