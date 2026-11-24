import { Outlet } from 'react-router';
import { TeacherSidebar } from './TeacherSidebar';

export function TeacherLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-white lg:flex-row">
      <TeacherSidebar />
      <div className="min-w-0 flex-1">
        <header className="px-5 pt-5 lg:px-8 lg:pt-8">
          <h1 className="text-xl font-semibold">Teacher workspace</h1>
        </header>
        <main className="space-y-6 p-5 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
