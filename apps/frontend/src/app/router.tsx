import { createBrowserRouter } from 'react-router';
import { LandingPage } from '@/features/landing/LandingPage';

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '*', element: <div className="p-6">Page not found</div> },
]);