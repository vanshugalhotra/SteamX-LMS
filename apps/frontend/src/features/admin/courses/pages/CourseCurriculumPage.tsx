import { useState } from 'react';
import { useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import type { CourseOutline, CourseOutlineModule } from '../model/types';
import { CourseSummaryHeader } from '../components/CourseSummaryHeader';
import { CurriculumModulesSection } from '../components/CurriculumModulesSection';
import { useCourseOutline } from '../queries';

function CourseCurriculumContent({ outline }: { outline: CourseOutline }) {
  const [moduleDialog, setModuleDialog] = useState<CourseOutlineModule | 'new' | null>(null);

  return (
    <>
      <CourseSummaryHeader
        outline={outline}
        onAddModule={() => {
          setModuleDialog('new');
        }}
      />
      <CurriculumModulesSection
        outline={outline}
        moduleDialog={moduleDialog}
        setModuleDialog={setModuleDialog}
      />
    </>
  );
}

function CurriculumLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const notFound = error instanceof ApiError && error.status === 404;

  return (
    <div className="space-y-3">
      <Alert>{notFound ? 'Course not found.' : getErrorMessage(error)}</Alert>
      {!notFound && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function CourseCurriculumPage() {
  const { id = '' } = useParams();
  const { data, isPending, error, isError, refetch } = useCourseOutline(id);
  const retry = () => {
    void refetch();
  };

  const renderContent = () => {
    if (isPending) {
      return (
        <div className="space-y-5" role="status" aria-label="Loading course curriculum">
          <div className="h-52 animate-pulse rounded-3xl bg-gray-100" />
          <div className="h-16 animate-pulse rounded-3xl bg-gray-100" />
          <div className="h-16 animate-pulse rounded-3xl bg-gray-100" />
        </div>
      );
    }

    if (!data) {
      return <CurriculumLoadError error={error} onRetry={retry} />;
    }

    return (
      <>
        {isError && <CurriculumLoadError error={error} onRetry={retry} />}
        <CourseCurriculumContent key={id} outline={data} />
      </>
    );
  };

  return (
    <div className="space-y-6">
      <BackLink to={PATHS.admin.courses}>All courses</BackLink>
      {renderContent()}
    </div>
  );
}
