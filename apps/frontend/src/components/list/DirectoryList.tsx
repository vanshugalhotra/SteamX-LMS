import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { AvatarInitial } from '@/components/ui/avatar-initial';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DirectoryCardData {
  id: string;
  title: string;
  /** Second line, e.g. "CODE · City". */
  subtitle: ReactNode;
  badge: ReactNode;
  to: string;
}

interface DirectoryListProps<T> {
  rows: T[] | undefined;
  toCard: (row: T) => DirectoryCardData;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  emptyMessage: string;
  errorMessage: string;
  loadingLabel: string;
  /** Highlights the item currently being edited. */
  currentId?: string;
}

export function DirectoryList<T>({
  rows,
  toCard,
  isPending,
  isError,
  onRetry,
  emptyMessage,
  errorMessage,
  loadingLabel,
  currentId,
}: DirectoryListProps<T>) {
  if (isPending) {
    return (
      <div className="grid gap-3 md:grid-cols-2" role="status" aria-label={loadingLabel}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-18 animate-pulse rounded-2xl bg-gray-100" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="space-y-3">
        <Alert>{errorMessage}</Alert>
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  if (!rows?.length) {
    return <p className="p-8 text-center text-sm text-gray-600">{emptyMessage}</p>;
  }

  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {rows.map((row) => {
        const card = toCard(row);
        const current = card.id === currentId;
        return (
          <li key={card.id} className="min-w-0">
            <Link
              to={card.to}
              aria-current={current ? 'true' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 outline-none hover:shadow-md focus-visible:ring-4 focus-visible:ring-ring/40',
                current && 'border-coral-500 ring-2 ring-coral-500',
              )}
            >
              <AvatarInitial name={card.title} seed={card.id} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold">{card.title}</p>
                <p className="truncate text-xs text-gray-600">{card.subtitle}</p>
              </div>
              {card.badge}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
