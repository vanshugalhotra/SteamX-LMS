import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  maxLength?: number;
}

export function SearchBox({ value, onChange, placeholder, label, maxLength }: SearchBoxProps) {
  return (
    <label className="flex max-w-xs min-w-0 flex-1 items-center gap-2 rounded-full bg-gray-100 px-5 py-3 text-gray-600 focus-within:ring-4 focus-within:ring-ring/40">
      <input
        type="search"
        value={value}
        maxLength={maxLength}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        placeholder={placeholder}
        aria-label={label}
        className="w-full min-w-0 bg-transparent text-xs text-foreground outline-none placeholder:text-gray-400"
      />
      <Search className="size-4 shrink-0" aria-hidden="true" />
    </label>
  );
}

interface ListToolbarProps<T extends string> {
  filters: FilterOption<T>[];
  filter: T;
  onFilterChange: (value: T) => void;
  filterLabel: string;
  variant?: 'chips' | 'segmented';
}

export function ListToolbar<T extends string>({
  filters,
  filter,
  onFilterChange,
  filterLabel,
  variant,
}: ListToolbarProps<T>) {

  const segmented = variant === 'segmented';

  return (
    <div role="group" aria-label={filterLabel} className={cn('flex flex-wrap gap-2', segmented && 'gap-0.5 rounded-full bg-gray-100 p-1')}>
      {filters.map((f) => (
        <button
          key={f.value}
          type="button"
          aria-pressed={filter === f.value}
          onClick={() => {
            onFilterChange(f.value);
          }}
          className={cn(
            'rounded-full px-4 py-2 text-[11px] font-medium outline-none focus-visible:ring-4 focus-visible:ring-ring/40',
            segmented
              ? filter === f.value ? 'bg-white text-foreground shadow-sm' : 'text-gray-600'
              : filter === f.value ? 'bg-gray-900 text-white' : 'bg-gray-100',
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
