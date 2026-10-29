import { useParams } from 'react-router';
import { FormPageLayout } from '@/components/form/FormPageLayout';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import { UserStatusBadge } from '../../users/components/UserStatusBadge';
import { useUser } from '../../users/queries';

const row = (label: string, value: React.ReactNode) => (
  <div className="flex justify-between gap-4 py-3 text-xs">
    <dt className="shrink-0 text-gray-600">{label}</dt>
    <dd className="min-w-0 text-right font-medium wrap-break-word">{value}</dd>
  </div>
);

export function AdminViewPage() {
  const { id = '' } = useParams();
  const { data: user, isPending, error, refetch } = useUser(id);

  let content;
  if (isPending) {
    content = (
      <div
        className="h-40 animate-pulse rounded-xl bg-gray-100"
        role="status"
        aria-label="Loading admin"
      />
    );
  } else if (error || user.userType !== 'PLATFORM_STAFF') {
    content = (
      <div className="space-y-3">
        <Alert>{error ? getErrorMessage(error) : 'Admin not found.'}</Alert>
        {error && (
          <Button variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        )}
      </div>
    );
  } else {
    content = (
      <dl className="divide-y divide-gray-200">
        {row('Name', user.name)}
        {row('SteamX ID', user.steamxId)}
        {row('Email', user.email ?? '-')}
        {row('Role', user.role.name)}
        {row('Status', <UserStatusBadge status={user.status} />)}
        {row(
          'Added',
          new Date(user.createdAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }),
        )}
      </dl>
    );
  }

  return (
    <FormPageLayout
      title="Admin details"
      subtitle="Read-only. Admin accounts cannot be edited here."
      backTo={PATHS.admin.admins}
      backLabel="Admins"
      tag={user?.steamxId}
    >
      {content}
    </FormPageLayout>
  );
}
