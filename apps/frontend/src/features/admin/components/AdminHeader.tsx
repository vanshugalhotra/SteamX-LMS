import { useSession } from '@/features/auth/queries';

export function AdminHeader() {
  const profile = useSession();

  return (
    <header className="hidden items-center justify-end gap-3 px-5 pt-5 lg:flex lg:px-8 lg:pt-8">
      <div className="flex items-center gap-2 rounded-2xl bg-white py-1.5 pr-4 pl-1.5 shadow-md">
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-full bg-yellow-500 text-xs font-semibold text-gray-900"
        >
          {profile?.name.charAt(0).toUpperCase()}
        </span>
        <p className="text-xs font-medium">{profile?.name}</p>
      </div>
    </header>
  );
}
