import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from './input';

export interface AsyncOption {
  value: string;
  label: string;
  description?: string;
}

export interface AsyncSearchResult {
  options: AsyncOption[];
  isPending: boolean;
  isError: boolean;
}

interface AsyncSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Hook that searches the API for the typed text. `context` is e.g. the chosen school id. */
  useSearch: (search: string, context: string) => AsyncSearchResult;
  /** Extra value the search depends on (e.g. a school id). */
  searchContext?: string;
  /** Label to show for `value` before the user picks anything (edit forms). */
  initialLabel?: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

export function AsyncSelect({
  id,
  value,
  onChange,
  useSearch,
  searchContext = '',
  initialLabel = '',
  placeholder,
  maxLength = 120,
  disabled,
  ...aria
}: AsyncSelectProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [label, setLabel] = useState(initialLabel);
  const { options, isPending, isError } = useSearch(query, searchContext);
  const [active, setActive] = useState(0);

  // Clearing the field also clears the chosen value.
  const shown = open ? query : value ? label : '';

  const choose = (option: AsyncOption) => {
    onChange(option.value);
    setLabel(option.label);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (active < options.length) choose(options[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div
      className="relative"
      onBlur={(e) => {
        // Close only when focus leaves the whole control.
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <Input
        {...aria}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && active < options.length ? `${listId}-${String(active)}` : undefined
        }
        autoComplete="off"
        value={shown}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        className="h-10.5 pr-10"
        onFocus={() => {
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
          if (e.target.value === '') onChange('');
        }}
        onKeyDown={onKeyDown}
      />
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-gray-600"
        aria-hidden="true"
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg"
        >
          {isPending && <li className="px-3 py-2 text-xs text-gray-600">Searching…</li>}
          {isError && <li className="px-3 py-2 text-xs text-danger">Couldn't load results.</li>}
          {!isPending && !isError && options.length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-600">No results found.</li>
          )}
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${String(index)}`}
              role="option"
              aria-selected={option.value === value}
              // mousedown (not click) so the input does not blur first.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(option);
              }}
              className={cn(
                'cursor-pointer rounded-lg px-3 py-2 text-sm',
                index === active && 'bg-gray-100',
                option.value === value && 'font-semibold',
              )}
            >
              {option.label}
              {option.description && (
                <span className="ml-2 text-xs font-normal text-gray-600">{option.description}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
