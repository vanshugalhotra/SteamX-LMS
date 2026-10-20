import { cn } from '@/lib/utils';

const COLORS = ['bg-teal-500', 'bg-coral-500', 'bg-yellow-500', 'bg-magenta-500'] as const;

function colorFor(text: string) {
  let hash = 5381;
  for (const char of text) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export function AvatarInitial({
  name,
  seed = name,
  className,
}: {
  name: string;
  seed?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold text-white',
        colorFor(seed),
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
