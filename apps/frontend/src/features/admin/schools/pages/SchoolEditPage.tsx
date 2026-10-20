import { useNavigate, useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { PATHS } from '@/lib/paths';
import { SchoolForm } from '../components/SchoolForm';
import { SchoolFormLayout } from '../components/SchoolFormLayout';
import { SchoolStatusSection } from '../components/SchoolStatusSection';
import { useSchool } from '../queries';

export function SchoolEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: school, isPending, error, refetch } = useSchool(id);
  const backToList = () => {
    void navigate(PATHS.admin.schools);
  };

  let content;
  if (isPending) {
    content = (
      <div
        className="h-64 animate-pulse rounded-xl bg-gray-100"
        role="status"
        aria-label="Loading school"
      />
    );
  } else if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    content = (
      <div className="space-y-3">
        <Alert>
          {notFound ? 'School not found.' : "We couldn't load this school. Please try again."}
        </Alert>
        {!notFound && (
          <Button variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        )}
      </div>
    );
  } else {
    content = (
      <>
        <SchoolStatusSection school={school} />
        <SchoolForm school={school} onDone={backToList} onCancel={backToList} />
      </>
    );
  }

  return <SchoolFormLayout title="Edit school">{content}</SchoolFormLayout>;
}
