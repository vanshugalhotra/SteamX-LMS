import { createBrowserRouter, redirect } from 'react-router';
import { LandingPage } from '@/features/landing/LandingPage';
import { guestOnlyLoader, changePasswordLoader, protectedLoader } from '@/features/auth/loaders';
import { PATHS } from '@/lib/paths';
import { RootFallback, RootError } from './route-fallbacks';

export const router = createBrowserRouter([
  {
    HydrateFallback: RootFallback,
    errorElement: <RootError />,
    children: [
      { path: PATHS.home, element: <LandingPage /> },
      {
        path: PATHS.login,
        loader: guestOnlyLoader,
        lazy: async () => {
          const { LoginPage } = await import('@/features/auth/pages/LoginPage');
          return { Component: LoginPage };
        },
      },
      {
        path: PATHS.changePassword,
        loader: changePasswordLoader,
        lazy: async () => {
          const { ChangePasswordPage } = await import('@/features/auth/pages/ChangePasswordPage');
          return { Component: ChangePasswordPage };
        },
      },
      {
        loader: protectedLoader,
        lazy: async () => {
          const { AdminLayout } = await import('@/features/admin/components/AdminLayout');
          return { Component: AdminLayout };
        },
        children: [
          {
            path: PATHS.admin.dashboard,
            lazy: async () => {
              const { DashboardPage } = await import('@/features/admin/pages/DashboardPage');
              return { Component: DashboardPage };
            },
          },
          { path: PATHS.admin.base, loader: () => redirect(PATHS.admin.dashboard) },
        ],
      },
      { path: '*', element: <div className="p-6">Page not found</div> },
    ],
  },
]);
