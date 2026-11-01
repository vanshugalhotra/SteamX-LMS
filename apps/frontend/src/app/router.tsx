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
          {
            path: PATHS.admin.schools,
            lazy: async () => {
              const { SchoolsPage } = await import('@/features/admin/schools/pages/SchoolsPage');
              return { Component: SchoolsPage };
            },
          },
          {
            path: PATHS.admin.schoolNew,
            lazy: async () => {
              const { SchoolCreatePage } =
                await import('@/features/admin/schools/pages/SchoolCreatePage');
              return { Component: SchoolCreatePage };
            },
          },
          {
            path: PATHS.admin.schoolEdit(':id'),
            lazy: async () => {
              const { SchoolEditPage } =
                await import('@/features/admin/schools/pages/SchoolEditPage');
              return { Component: SchoolEditPage };
            },
          },
          {
            path: PATHS.admin.teachers,
            lazy: async () => {
              const { TeachersPage } = await import('@/features/admin/teachers/pages/TeachersPage');
              return { Component: TeachersPage };
            },
          },
          {
            path: PATHS.admin.teacherNew,
            lazy: async () => {
              const { TeacherCreatePage } =
                await import('@/features/admin/teachers/pages/TeacherCreatePage');
              return { Component: TeacherCreatePage };
            },
          },
          {
            path: PATHS.admin.teacherEdit(':id'),
            lazy: async () => {
              const { TeacherEditPage } =
                await import('@/features/admin/teachers/pages/TeacherEditPage');
              return { Component: TeacherEditPage };
            },
          },
          {
            path: PATHS.admin.students,
            lazy: async () => {
              const { StudentsPage } = await import('@/features/admin/students/pages/StudentsPage');
              return { Component: StudentsPage };
            },
          },
          {
            path: PATHS.admin.studentNew,
            lazy: async () => {
              const { StudentCreatePage } =
                await import('@/features/admin/students/pages/StudentCreatePage');
              return { Component: StudentCreatePage };
            },
          },
          {
            path: PATHS.admin.studentEdit(':id'),
            lazy: async () => {
              const { StudentEditPage } =
                await import('@/features/admin/students/pages/StudentEditPage');
              return { Component: StudentEditPage };
            },
          },
          {
            path: PATHS.admin.classSectionNew,
            lazy: async () => {
              const { ClassSectionCreatePage } =
                await import('@/features/admin/class-sections/pages/ClassSectionCreatePage');
              return { Component: ClassSectionCreatePage };
            },
          },
          {
            path: PATHS.admin.classSections,
            lazy: async () => {
              const { ClassSectionsPage } =
                await import('@/features/admin/class-sections/pages/ClassSectionsPage');
              return { Component: ClassSectionsPage };
            },
          },
          {
            path: PATHS.admin.classSectionEdit(':id'),
            lazy: async () => {
              const { ClassSectionEditPage } =
                await import('@/features/admin/class-sections/pages/ClassSectionEditPage');
              return { Component: ClassSectionEditPage };
            },
          },
          {
            path: PATHS.admin.assets,
            lazy: async () => {
              const { AssetsPage } = await import('@/features/admin/assets/pages/AssetsPage');
              return { Component: AssetsPage };
            },
          },
          {
            path: PATHS.admin.assetUpload,
            lazy: async () => {
              const { AssetUploadPage } =
                await import('@/features/admin/assets/pages/AssetUploadPage');
              return { Component: AssetUploadPage };
            },
          },
          {
            path: PATHS.admin.assetView(':id'),
            lazy: async () => {
              const { AssetDetailPage } =
                await import('@/features/admin/assets/pages/AssetDetailPage');
              return { Component: AssetDetailPage };
            },
          },
          {
            path: PATHS.admin.admins,
            lazy: async () => {
              const { AdminsPage } = await import('@/features/admin/admins/pages/AdminsPage');
              return { Component: AdminsPage };
            },
          },
          {
            path: PATHS.admin.adminView(':id'),
            lazy: async () => {
              const { AdminViewPage } = await import('@/features/admin/admins/pages/AdminViewPage');
              return { Component: AdminViewPage };
            },
          },
          { path: PATHS.admin.base, loader: () => redirect(PATHS.admin.dashboard) },
        ],
      },
      { path: '*', element: <div className="p-6">Page not found</div> },
    ],
  },
]);
