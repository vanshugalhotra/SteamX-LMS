import { useSession } from '@/features/auth/queries';

export function AdminHeader({ slotRef }: { slotRef: (el: HTMLDivElement | null) => void }) {
  const profile = useSession();

  return (
    <header className="flex items-center gap-3 px-5 pt-5 lg:px-8 lg:pt-8">
      {/* Pages can render controls here (e.g. search) through <HeaderSlot>. */}
      <div ref={slotRef} className="flex min-w-0 flex-1" />
      <div className="hidden items-center gap-2 rounded-2xl bg-white py-1.5 pr-4 pl-1.5 shadow-md lg:flex">
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-full bg-yellow-500 text-xs font-semibold text-gray-900"
        >
          {profile?.name.charAt(0).toUpperCase()}
        </span>
        <div className="leading-tight">
          <p className="text-xs font-medium">{profile?.name}</p>
          <p className="text-[10px] text-gray-600 capitalize">{profile?.roleKey}</p>
        </div>
      </div>
    </header>
  );
}
