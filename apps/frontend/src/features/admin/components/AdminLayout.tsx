import { Outlet } from 'react-router';
import { AdminHeader } from './AdminHeader';
import { AdminSidebar } from './AdminSidebar';

export function AdminLayout() {
  return (
    <div className="mx-auto min-h-svh max-w-7xl sm:p-6">
      <div className="flex flex-col overflow-clip bg-white sm:rounded-4xl sm:shadow-[0_10px_40px_rgba(31,27,78,.08)] lg:flex-row">
        <AdminSidebar />
        <div className="min-w-0 flex-1">
          <AdminHeader />
          <main className="p-5 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
