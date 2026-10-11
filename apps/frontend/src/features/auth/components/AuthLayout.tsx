import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

function Logo({ onBrand = false, className }: { onBrand?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5 text-[22px] font-semibold tracking-tight', className)}>
      <span className="relative h-7.5 w-8.5 flex-none" aria-hidden="true">
        <i className="absolute bottom-0 left-0 size-5.5 rounded-full bg-coral-500" />
        <i
          className={cn(
            'absolute top-0 right-0 size-4 rounded-full',
            onBrand ? 'bg-white' : 'bg-teal-500 outline-2 outline-white',
          )}
        />
      </span>
      SteamX
    </div>
  );
}

function BrandArt() {
  return (
    <svg className="mt-8 block h-auto w-full max-w-75" viewBox="0 0 576 576" fill="none" aria-hidden="true">
      <circle cx="88" cy="88" r="88" className="fill-coral-500" />
      <path d="M200 176A176 176 0 0 1 376 0V176Z" className="fill-yellow-500" />
      <rect x="400" y="0" width="176" height="176" rx="44" className="fill-white" />
      <path d="M0 200H88A88 88 0 0 1 88 376H0Z" className="fill-magenta-500" />
      <path
        d="M236 200H340A36 36 0 0 1 376 236A140 140 0 0 1 236 376A36 36 0 0 1 200 340V236A36 36 0 0 1 236 200Z"
        className="fill-teal-800"
      />
      <path d="M400 200H576A176 176 0 0 1 400 376Z" className="fill-coral-100" />
      <rect x="0" y="400" width="176" height="176" rx="44" className="fill-teal-200" />
      <circle cx="288" cy="488" r="48" className="fill-gray-900" />
      <path d="M400 576V488A88 88 0 0 1 576 488V576Z" className="fill-yellow-400" />
    </svg>
  );
}

function BrandPanel() {
  return (
    <aside
      aria-label="SteamX"
      className="relative hidden min-h-160 flex-col justify-between overflow-hidden rounded-4xl bg-teal-500 p-8 text-gray-900 min-[900px]:flex min-[1025px]:p-10"
    >
      <span aria-hidden="true" className="pointer-events-none absolute -top-27.5 -right-35 size-100 rounded-full bg-white/25" />
      <span aria-hidden="true" className="pointer-events-none absolute top-46.75 right-20 size-17.5 rounded-full bg-yellow-500" />
      <span aria-hidden="true" className="pointer-events-none absolute -right-18.75 bottom-28 size-62.5 rounded-full bg-magenta-500" />

      <Logo onBrand />
      <div className="relative">
        <h2 className="max-w-[14ch] text-[28px] leading-tight font-semibold tracking-tight min-[1025px]:text-[34px]">
          Your lessons are ready when you are.
        </h2>
        <BrandArt />
      </div>
      <span />
    </aside>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-svh min-[900px]:grid-cols-[1.05fr_1fr] min-[900px]:gap-6 min-[900px]:p-6">
      <BrandPanel />
      <section className="flex items-start justify-center px-5 py-6 min-[600px]:px-6 min-[600px]:py-12 min-[900px]:items-center min-[900px]:px-2 min-[900px]:py-6">
        <div className="w-full max-w-100 min-[600px]:max-w-120 min-[600px]:rounded-[28px] min-[600px]:bg-white min-[600px]:px-9 min-[600px]:py-10 min-[600px]:shadow-[0_12px_40px_rgba(31,27,78,.08)] min-[900px]:max-w-100 min-[900px]:rounded-none min-[900px]:bg-transparent min-[900px]:p-0 min-[900px]:shadow-none">
          <Logo className="mb-7 min-[900px]:hidden" />
          {children}
        </div>
      </section>
    </main>
  );
}
