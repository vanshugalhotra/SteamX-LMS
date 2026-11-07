import { useState } from 'react';
import { useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import { LessonEditor } from '../components/LessonEditor';
import { useLesson, useLessonContent } from '../queries';

export function LessonEditorPage() {
  const { id = '' } = useParams();
  const lesson = useLesson(id);
  const content = useLessonContent(id);
  const [reloadCount, setReloadCount] = useState(0);

  if (lesson.isPending || content.isPending) {
    return <div role="status" className="h-52 animate-pulse rounded-3xl bg-gray-100" />;
  }
  const error = lesson.error ?? content.error;
  if (error || !lesson.data || !content.data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="space-y-3">
        <Alert>{notFound ? 'Lesson not found.' : getErrorMessage(error)}</Alert>
        {!notFound && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void (lesson.error ? lesson.refetch() : content.refetch());
            }}
          >
            Try again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <BackLink to={PATHS.admin.courseCurriculum(lesson.data.courseId)}>
        Back to course curriculum
      </BackLink>
      <LessonEditor
        key={`${lesson.data.id}-${String(reloadCount)}`}
        lesson={lesson.data}
        content={content.data}
        onReload={() => {
          void content.refetch().then((result) => {
            if (result.isSuccess) {
              setReloadCount((count) => count + 1);
            }
          });
        }}
      />
    </div>
  );
}
