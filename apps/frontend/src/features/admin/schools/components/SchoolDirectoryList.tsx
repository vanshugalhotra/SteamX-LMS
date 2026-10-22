import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { AvatarInitial } from '@/components/ui/avatar-initial';
import { Button } from '@/components/ui/button';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';
import type { School } from '../model/types';
import { SchoolStatusBadge } from './SchoolStatusBadge';

interface SchoolDirectoryListProps {
  schools: School[] | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Highlights the school currently being edited. */
  currentId?: string;
}

export function SchoolDirectoryList({
  schools,
  isPending,
  isError,
  onRetry,
  currentId,
}: SchoolDirectoryListProps) {
  if (isPending) {
    return (
      <div className="grid gap-3 md:grid-cols-2" role="status" aria-label="Loading schools">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-18 animate-pulse rounded-2xl bg-gray-100" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-3">
        <Alert>We couldn't load the schools. Please try again.</Alert>
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (!schools?.length) {
    return <p className="p-8 text-center text-sm text-gray-600">No schools match your filters.</p>;
  }

  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {schools.map((school) => (
        <li key={school.id} className="min-w-0">
          <Link
            to={PATHS.admin.schoolEdit(school.id)}
            aria-current={school.id === currentId ? 'true' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 outline-none hover:shadow-md focus-visible:ring-4 focus-visible:ring-ring/40',
              school.id === currentId && 'border-coral-500 ring-2 ring-coral-500',
            )}
          >
            <AvatarInitial name={school.name} seed={school.id} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold">{school.name}</p>
              <p className="truncate text-xs text-gray-600">
                <span className="font-semibold text-foreground">{school.code}</span> · {school.city},{' '}
                {school.state}
              </p>
            </div>
            <SchoolStatusBadge status={school.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
