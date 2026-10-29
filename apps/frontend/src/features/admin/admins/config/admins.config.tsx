import { Eye } from 'lucide-react';
import { AvatarInitial } from '@/components/ui/avatar-initial';
import { ButtonLink } from '@/components/ui/button-link';
import type { DataTableColumn } from '@/components/ui/data-table';
import { PATHS } from '@/lib/paths';
import { UserStatusBadge } from '../../users/components/UserStatusBadge';
import type { UserListItem } from '../../users/model/types';

export const ADMINS_PAGE_SIZE = 10;
export const ADMINS_SEARCH_MAX_LENGTH = 100;

export const adminColumns: DataTableColumn<UserListItem>[] = [
  {
    key: 'admin',
    header: 'Admin',
    width: '2fr',
    cell: (a) => (
      <div className="flex min-w-0 items-center gap-3">
        <AvatarInitial name={a.name} seed={a.id} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{a.name}</p>
          <p className="truncate text-[11px] text-gray-600">{a.steamxId}</p>
        </div>
      </div>
    ),
  },
  { key: 'email', header: 'Email', width: '1.6fr', mobileLabel: true, cell: (a) => a.email ?? '-' },
  {
    key: 'status',
    header: 'Status',
    width: '.8fr',
    cell: (a) => <UserStatusBadge status={a.status} />,
  },
  {
    key: 'actions',
    header: '',
    width: 'auto',
    className: 'md:justify-self-end',
    cell: (a) => (
      <ButtonLink
        to={PATHS.admin.adminView(a.id)}
        variant="secondary"
        size="sm"
        className="border border-gray-200 bg-white text-foreground hover:bg-gray-100"
      >
        <Eye className="size-3.5" aria-hidden="true" />
        View
      </ButtonLink>
    ),
  },
];
