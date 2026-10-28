import { SegmentedControl } from '@/components/ui/segmented-control';
import type { UserStatus } from '../model/types';

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active', dotClass: 'bg-teal-500' },
  { value: 'INACTIVE', label: 'Inactive', dotClass: 'bg-magenta-500' },
] satisfies { value: UserStatus; label: string; dotClass: string }[];

interface UserStatusSectionProps {
  value: UserStatus;
  onChange: (status: UserStatus) => void;
  plural: string;
  disabled?: boolean;
}

/** Status control for the user edit forms. */
export function UserStatusSection({ value, onChange, plural, disabled }: UserStatusSectionProps) {
  return (
    <div className="mb-4.5 sm:w-1/2 sm:pr-2">
      <SegmentedControl
        label="Account status"
        options={STATUS_OPTIONS}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      <p className="mt-1.5 text-xs text-gray-600">Inactive {plural} cannot sign in.</p>
    </div>
  );
}
