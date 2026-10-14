import { createBrowserRouter } from 'react-router';
import { LandingPage } from '@/features/landing/LandingPage';
import { guestOnlyLoader, changePasswordLoader } from '@/features/auth/loaders';
import { AUTH_PATHS } from '@/features/auth/paths';
import { RootFallback, RootError } from './route-fallbacks';

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
          const { LoginPage } = await import('@/features/auth/LoginPage');
          return { Component: LoginPage };
        },
      },
      {
        path: AUTH_PATHS.changePassword,
        loader: changePasswordLoader,
        lazy: async () => {
          const { ChangePasswordPage } = await import('@/features/auth/ChangePasswordPage');
          return { Component: ChangePasswordPage };
        },
      },
      { path: '*', element: <div className="p-6">Page not found</div> },
    ],
  },
]);
