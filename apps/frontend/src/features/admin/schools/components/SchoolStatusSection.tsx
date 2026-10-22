import { SegmentedControl } from '@/components/ui/segmented-control';
import type { SchoolStatus } from '../model/types';

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active', dotClass: 'bg-teal-500' },
  { value: 'INACTIVE', label: 'Inactive', dotClass: 'bg-magenta-500' },
] satisfies { value: SchoolStatus; label: string; dotClass: string }[];

interface SchoolStatusSectionProps {
  value: SchoolStatus;
  onChange: (status: SchoolStatus) => void;
  disabled?: boolean;
}

/** Status control for the edit form. Saved together with the form's Save button. */
export function SchoolStatusSection({ value, onChange, disabled }: SchoolStatusSectionProps) {
  return (
    <div className="mb-4.5 sm:w-1/2 sm:pr-2">
      <SegmentedControl
        label="School status"
        options={STATUS_OPTIONS}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      <p className="mt-1.5 text-xs text-gray-600">Users of an inactive school cannot sign in.</p>
    </div>
  );
}
