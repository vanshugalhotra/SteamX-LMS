import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { PATHS } from '@/lib/paths';
import { SESSION_EXPIRED } from '../model/redirects';

const { loginApi } = vi.hoisted(() => ({ loginApi: vi.fn() }));
vi.mock('../api/api', () => ({
  login: loginApi,
  logout: vi.fn(),
  fetchSession: vi.fn(),
  changePassword: vi.fn(),
}));

import { LoginPage } from './LoginPage';

function renderLogin(state?: unknown) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[{ pathname: PATHS.login, state }]}>
        <Routes>
          <Route path={PATHS.login} element={<LoginPage />} />
          <Route path={PATHS.admin.dashboard} element={<div>Dashboard home</div>} />
          <Route path={PATHS.changePassword} element={<div>Change password screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillAndSubmit(steamxId: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('SteamX ID'), steamxId);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    loginApi.mockReset();
  });

  it('does not call the API when the form is empty', async () => {
    renderLogin();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }));

    // Wait for validation to settle, then make sure nothing was sent.
    await waitFor(() => {
      expect(screen.getByLabelText('SteamX ID')).toHaveAttribute('aria-invalid', 'true');
    });
    expect(loginApi).not.toHaveBeenCalled();
  });

  it('signs in and goes to the home page', async () => {
    loginApi.mockResolvedValue({ mustChangePassword: false });
    renderLogin();

    await fillAndSubmit('SCH-001', 'secret-pass');

    expect(await screen.findByText('Dashboard home')).toBeInTheDocument();
    expect(loginApi).toHaveBeenCalledWith(
      { steamxId: 'SCH-001', password: 'secret-pass' },
      expect.anything(),
    );
  });

  it('goes to change-password when the account requires it', async () => {
    loginApi.mockResolvedValue({ mustChangePassword: true });
    renderLogin();

    await fillAndSubmit('SCH-001', 'secret-pass');

    expect(await screen.findByText('Change password screen')).toBeInTheDocument();
  });

  it('shows the login-specific message on UNAUTHORIZED', async () => {
    loginApi.mockRejectedValue(new ApiError(401, 'Unauthorized', { code: 'UNAUTHORIZED' }));
    renderLogin();

    await fillAndSubmit('SCH-001', 'wrong');

    expect(await screen.findByText(/Check your SteamX ID and password/)).toBeInTheDocument();
  });

  it('shows the network message when the request fails to connect', async () => {
    loginApi.mockRejectedValue(new ApiError(0, 'Network error'));
    renderLogin();

    await fillAndSubmit('SCH-001', 'secret-pass');

    expect(
      await screen.findByText('Network error. Please check your connection.'),
    ).toBeInTheDocument();
  });

  it('shows the session-expired notice when redirected with that reason', () => {
    renderLogin({ reason: SESSION_EXPIRED });
    expect(screen.getByText('Your session has expired. Please sign in again.')).toBeInTheDocument();
  });

  it('does not show the notice on a normal visit', () => {
    renderLogin();
    expect(screen.queryByText(/session has expired/)).not.toBeInTheDocument();
  });
});
