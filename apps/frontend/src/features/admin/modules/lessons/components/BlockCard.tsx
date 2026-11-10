import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Trash2, type LucideIcon } from 'lucide-react';
import { BLOCK_META, FALLBACK_ACCENT, getBlockLabel } from '../model/blocks';
import type { LessonContentBlock } from '../model/types';
import { Badge } from '@/components/ui/badge';

function BlockAction({
  icon: Icon,
  label,
  danger,
  ...props
}: {
  icon: LucideIcon;
  label: string;
  danger?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid size-8 place-items-center rounded-lg text-gray-600 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 ${
        danger ? 'hover:bg-danger-soft hover:text-danger' : 'hover:bg-gray-100'
      }`}
      {...props}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}

export function BlockCard({
  type,
  index,
  count,
  disabled,
  nested = false,
  contextLabel,
  onMove,
  onRemove,
  children,
}: {
  type: LessonContentBlock['type'];
  index: number;
  count: number;
  disabled: boolean;
  nested?: boolean;
  contextLabel?: string;
  onMove?: (direction: -1 | 1) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const label = getBlockLabel(type);
  const accent = BLOCK_META[type]?.accent ?? FALLBACK_ACCENT;
  return (
    <article
      className={`relative rounded-2xl border border-brand-line bg-white before:absolute before:inset-y-3 before:-left-px before:w-1 before:rounded-r ${accent}`}
    >
      <div className="flex items-center gap-2 px-4 pt-3">
        {!nested && <span className="text-[11px] font-semibold text-gray-600">{index + 1}</span>}
        <Badge variant="neutral">{label}</Badge>
        <div className="ml-auto flex">
          {!nested && (
            <>
              <BlockAction
                icon={ArrowUp}
                label={`Move ${label} block up`}
                disabled={disabled || index === 0}
                onClick={() => {
                  onMove?.(-1);
                }}
              />
              <BlockAction
                icon={ArrowDown}
                label={`Move ${label} block down`}
                disabled={disabled || index === count - 1}
                onClick={() => {
                  onMove?.(1);
                }}
              />
            </>
          )}
          <BlockAction
            icon={Trash2}
            danger
            label={`Remove ${label} block${contextLabel ? ` from ${contextLabel}` : ''}`}
            disabled={disabled}
            onClick={onRemove}
          />
        </div>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </article>
  );
}
