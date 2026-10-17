import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Drawer({ title, onClose, children }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="fixed inset-y-0 right-0 m-0 ml-auto h-svh max-h-none w-full max-w-md flex-col bg-white p-0 text-foreground shadow-2xl backdrop:bg-black/40 open:flex"
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.closest('dialog')?.close();
          }}
          aria-label="Close"
          className="grid size-8 place-items-center rounded-full bg-gray-100 outline-none hover:bg-gray-200 focus-visible:ring-4 focus-visible:ring-ring/40"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
