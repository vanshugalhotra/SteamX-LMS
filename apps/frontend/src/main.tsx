import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { Providers } from '@/app/providers';
import { router } from '@/app/router';
import { Toaster } from 'sonner';
import { registerSessionHandlers } from '@/app/session-handlers';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

registerSessionHandlers();

createRoot(rootElement).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
      <Toaster position="top-center" />
    </Providers>
  </StrictMode>,
);
