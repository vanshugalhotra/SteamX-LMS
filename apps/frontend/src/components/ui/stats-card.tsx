import { cn } from '@/lib/utils';

const TONES = {
  teal: 'bg-teal-500 text-white',
  yellow: 'bg-yellow-500 text-white',
  coral: 'bg-coral-500 text-white',
  plain: 'bg-gray-50 text-foreground',
} as const;

interface StatsCardProps {
  label: string;
  value: number | undefined;
  hint?: string;
  tone?: keyof typeof TONES;
  isPending?: boolean;
}

export function StatsCard({ label, value, hint, tone = 'plain', isPending }: StatsCardProps) {
  return (
    <div className={cn('flex min-h-30 flex-col justify-between rounded-2xl p-5', TONES[tone])}>
      <div>
        {isPending ? (
          <div className="h-8 w-16 animate-pulse rounded bg-white/40" aria-hidden="true" />
        ) : (
          <p className="text-3xl leading-none font-semibold">{value?.toLocaleString() ?? '-'}</p>
        )}
        <p className="mt-2 text-xs font-medium">{label}</p>
      </div>
      {hint && <p className="mt-3 text-[10px]">{hint}</p>}
    </div>
  );
}
