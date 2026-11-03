import { useNavigate, useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import { CourseForm } from '../components/CourseForm';
import { CourseFormLayout } from '../components/CourseFormLayout';
import { useCourse } from '../queries';

export function CourseEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: course, isPending, error, refetch } = useCourse(id);
  const backToList = () => {
    void navigate(PATHS.admin.courses);
  };

  let content;
  if (isPending) {
    content = (
      <div
        className="h-48 animate-pulse rounded-xl bg-gray-100"
        role="status"
        aria-label="Loading course"
      />
    );
  } else if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    content = (
      <div className="space-y-3">
        <Alert>{notFound ? 'Course not found.' : getErrorMessage(error)}</Alert>
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
        <CourseForm key={course.id} course={course} onDone={backToList} onCancel={backToList} />
      </>
    );
  }

  return (
    <CourseFormLayout
      title="Edit course"
      subtitle="Update the course details and manage its publication status."
      backLabel={course?.title ?? 'All courses'}
    >
      {content}
    </CourseFormLayout>
  );
}
