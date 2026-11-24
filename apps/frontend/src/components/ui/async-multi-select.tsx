import { useState } from 'react';
import { X } from 'lucide-react';
import { AsyncSelect, type AsyncOption, type AsyncSelectProps } from './async-select';
import { Button } from './button';

interface AsyncMultiSelectProps extends Omit<
  AsyncSelectProps,
  'value' | 'onChange' | 'initialLabel' | 'onSelectOption'
> {
  selectedOptions: readonly AsyncOption[];
  onChange: (options: AsyncOption[]) => void;
  selectedLabel?: string;
  maxSelected?: number;
  disableRemove?: boolean;
}

export function AsyncMultiSelect({
  selectedOptions,
  onChange,
  selectedLabel = 'Selected options',
  maxSelected,
  disableRemove,
  excludeValues = [],
  disabled,
  ...selectProps
}: AsyncMultiSelectProps) {
  const [selectedValue, setSelectedValue] = useState('');
  const selectedIds = selectedOptions.map((option) => option.value);
  const selectionLimitReached = maxSelected !== undefined && selectedOptions.length >= maxSelected;

  const addOption = (option: AsyncOption) => {
    if ((disabled ?? false) || selectionLimitReached || selectedIds.includes(option.value)) return;
    onChange([...selectedOptions, option]);
    setSelectedValue('');
  };

  return (
    <div className="space-y-2">
      <AsyncSelect
        {...selectProps}
        value={selectedValue}
        onChange={setSelectedValue}
        onSelectOption={addOption}
        excludeValues={[...excludeValues, ...selectedIds]}
        disabled={(disabled ?? false) || selectionLimitReached}
      />
      {selectedOptions.length > 0 && (
        <ul aria-label={selectedLabel} className="flex flex-wrap gap-2">
          {selectedOptions.map((option) => (
            <li key={option.value}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disableRemove ?? disabled}
                aria-label={`Remove ${option.label}${option.description ? ` (${option.description})` : ''}`}
                onClick={() => {
                  onChange(selectedOptions.filter((selected) => selected.value !== option.value));
                }}
              >
                {option.label}
                {option.description && (
                  <span className="text-xs font-normal text-gray-600">{option.description}</span>
                )}
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
