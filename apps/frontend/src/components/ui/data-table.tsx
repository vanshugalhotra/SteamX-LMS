import type { CSSProperties, ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  width?: string;
  cell: (row: T) => ReactNode;
  mobileLabel?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  emptyMessage: string;
  errorMessage: string;
  loadingLabel?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  isPending,
  isError,
  onRetry,
  emptyMessage,
  errorMessage,
  loadingLabel = 'Loading',
}: DataTableProps<T>) {
  if (isPending) {
    return (
      <div className="space-y-2" role="status" aria-label={loadingLabel}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
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

  const template = columns.map((c) => c.width ?? '1fr').join(' ');
  const style = { '--table-cols': template } as CSSProperties;
  const grid = 'md:grid md:grid-cols-[var(--table-cols)] md:items-center md:gap-x-4';

  return (
    <div style={style}>
      <div className={cn('hidden px-3 pb-2 text-[10px] font-medium text-gray-600', grid)}>
        {columns.map((c) => (
          <span key={c.key}>{c.header}</span>
        ))}
      </div>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={getRowId(row)}
            className={cn('grid gap-y-2 rounded-xl bg-white p-3 shadow-sm', grid)}
          >
            {columns.map((c) => (
              <div key={c.key} className={cn('min-w-0 text-xs', c.className)}>
                {c.mobileLabel && <span className="text-gray-600 md:hidden">{c.header}: </span>}
                {c.cell(row)}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
