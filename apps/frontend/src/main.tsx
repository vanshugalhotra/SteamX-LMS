import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { Providers } from '@/app/providers';
import { router } from '@/app/router';
import { setApiHandlers } from '@/lib/api-client';
import './index.css';

setApiHandlers({
  onUnauthorized: () => {
    // INTENTIONAL: window.location.assign does a full page reload (not a SPA navigation),
    // which clears React Router state and the React Query cache so no stale user data
    // survives an expired session. Do not replace with navigate().
    if (window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
  },
  onForbidden: () => {
    // TODO: Revisit when role-based routing is in place.
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
