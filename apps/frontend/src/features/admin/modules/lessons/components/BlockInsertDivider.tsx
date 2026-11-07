import { Plus } from 'lucide-react';

export function BlockInsertDivider({
  disabled,
  onInsert,
}: {
  disabled: boolean;
  onInsert: () => void;
}) {
  return (
    <div className="group relative flex h-7 items-center justify-center">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-primary/50 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      />
      <button
        type="button"
        aria-label="Insert rich text block here"
        disabled={disabled}
        className="relative grid size-6 place-items-center rounded-full border border-brand-line bg-white text-gray-600 outline-none hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        onClick={() => {
          onInsert();
        }}
      >
        <Plus className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
