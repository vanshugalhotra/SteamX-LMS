import { createBrowserRouter } from 'react-router';
import { LandingPage } from '@/features/landing/LandingPage';
import { guestOnlyLoader, changePasswordLoader, protectedLoader } from '@/features/auth/loaders';
import { AUTH_PATHS } from '@/features/auth/model/paths';
import { RootFallback, RootError } from './route-fallbacks';
import { ADMIN_PATHS } from '@/features/admin/paths';

export const router = createBrowserRouter([
  {
    HydrateFallback: RootFallback,
    errorElement: <RootError />,
    children: [
      { path: '/', element: <LandingPage /> },
      {
        path: AUTH_PATHS.login,
        loader: guestOnlyLoader,
        lazy: async () => {
          const { LoginPage } = await import('@/features/auth/pages/LoginPage');
          return { Component: LoginPage };
        },
      },
      {
        path: AUTH_PATHS.changePassword,
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
            path: ADMIN_PATHS.dashboard,
            lazy: async () => {
              const { DashboardPage } = await import('@/features/admin/pages/DashboardPage');
              return { Component: DashboardPage };
            },
          },
        ],
      },
      { path: '*', element: <div className="p-6">Page not found</div> },
    ],
  },
]);
