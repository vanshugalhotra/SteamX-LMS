import { useState } from 'react';
import { Outlet } from 'react-router';
import { AdminHeader } from './AdminHeader';
import { AdminSidebar } from './AdminSidebar';

export interface AdminOutletContext {
  headerSlot: HTMLElement | null;
}

export function AdminLayout() {
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);

  return (
    <div className="flex min-h-svh flex-col bg-white lg:flex-row">
      <AdminSidebar />
      <div className="min-w-0 flex-1">
        <AdminHeader slotRef={setHeaderSlot} />
        <main className="space-y-6 p-5 lg:p-8">
          <Outlet context={{ headerSlot } satisfies AdminOutletContext} />
        </main>
      </div>
    </div>
  );
}
