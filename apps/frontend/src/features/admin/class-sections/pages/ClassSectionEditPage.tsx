import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { FormPageLayout } from '@/components/form/FormPageLayout';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ApiError } from '@/lib/api-client';
import { API_ERROR_CODE, getErrorMessage, hasErrorCode } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import { useSchoolNames } from '../../schools/queries';
import { ClassSectionForm } from '../components/ClassSectionForm';
import { classSectionLabel } from '../model/types';
import { useClassSection, useDeleteClassSection } from '../queries';

export function ClassSectionEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: section, isPending, error, refetch } = useClassSection(id);
  const schoolNames = useSchoolNames();
  const remove = useDeleteClassSection();
  const [confirming, setConfirming] = useState(false);
  const backToList = () => {
    void navigate(PATHS.admin.classSections);
  };
  const schoolName = section ? (schoolNames.get(section.schoolId) ?? '') : '';

  const onDelete = () => {
    remove.mutate(id, {
      onSuccess: () => {
        toast.success('Class section deleted');
        backToList();
      },
      onError: (e) => {
        setConfirming(false);
        toast.error(
          hasErrorCode(e, API_ERROR_CODE.RESOURCE_IN_USE)
            ? 'Students are assigned to this class section, so it cannot be deleted.'
            : getErrorMessage(e),
          { id: 'class-section-delete-failed' },
        );
      },
    });
  };

  let content;
  if (isPending) {
    content = (
      <div
        className="h-48 animate-pulse rounded-xl bg-gray-100"
        role="status"
        aria-label="Loading class section"
      />
    );
  } else if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    content = (
      <div className="space-y-3">
        <Alert>{notFound ? 'Class section not found.' : getErrorMessage(error)}</Alert>
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
        <ClassSectionForm
          key={`${section.id}-${schoolName}`}
          section={section}
          schoolName={schoolName}
          onDone={backToList}
          onCancel={backToList}
        />
        <div className="mt-6 flex items-center justify-between gap-3 rounded-xl bg-gray-50 p-4">
          <p className="text-xs text-gray-600">
            Deleting is only possible when no student is assigned to this class section.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setConfirming(true);
            }}
          >
            Delete
          </Button>
        </div>
        <ConfirmDialog
          open={confirming}
          title="Delete class section?"
          description={`"${classSectionLabel(section)}" will be removed permanently.`}
          confirmLabel="Delete"
          pending={remove.isPending}
          onConfirm={onDelete}
          onCancel={() => {
            setConfirming(false);
          }}
        />
      </>
    );
  }

  return (
    <FormPageLayout
      title="Edit class section"
      subtitle="Update the class and section name."
      backTo={PATHS.admin.classSections}
      backLabel="Class sections"
      tag={section ? classSectionLabel(section) : undefined}
      tagVariant="warning"
    >
      {content}
    </FormPageLayout>
  );
}
