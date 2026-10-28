import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { PATHS } from '@/lib/paths';

const { changePasswordApi } = vi.hoisted(() => ({ changePasswordApi: vi.fn() }));
vi.mock('../api/api', () => ({
  changePassword: changePasswordApi,
  login: vi.fn(),
  logout: vi.fn(),
  fetchSession: vi.fn(),
}));

import { ChangePasswordPage } from './ChangePasswordPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[PATHS.changePassword]}>
      <Routes>
        <Route path={PATHS.changePassword} element={<ChangePasswordPage />} />
        <Route path={PATHS.admin.dashboard} element={<div>Dashboard home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fill(current: string, next: string, confirm: string) {
  const user = userEvent.setup();
  if (current) await user.type(screen.getByLabelText('Current password'), current);
  if (next) await user.type(screen.getByLabelText('New password'), next);
  if (confirm) await user.type(screen.getByLabelText('Confirm new password'), confirm);
  await user.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('ChangePasswordPage', () => {
  beforeEach(() => {
    changePasswordApi.mockReset();
  });

  it('requires all three fields', async () => {
    renderPage();
    await fill('', '', '');

    expect(await screen.findByText('Enter your current password')).toBeInTheDocument();
    expect(screen.getByText('Enter a new password')).toBeInTheDocument();
    expect(screen.getByText('Confirm your new password')).toBeInTheDocument();
    expect(changePasswordApi).not.toHaveBeenCalled();
  });

  it('blocks submit when the confirmation does not match', async () => {
    renderPage();
    await fill('old-pass', 'new-pass-1', 'new-pass-2');

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(changePasswordApi).not.toHaveBeenCalled();
  });

  it('sends only current and new password, then goes home', async () => {
    changePasswordApi.mockResolvedValue({ mustChangePassword: false });
    renderPage();
    await fill('old-pass', 'new-pass-1', 'new-pass-1');

    expect(await screen.findByText('Dashboard home')).toBeInTheDocument();
    expect(changePasswordApi).toHaveBeenCalledWith({
      currentPassword: 'old-pass',
      newPassword: 'new-pass-1',
    });
  });

  it('lists every violated password rule', async () => {
    changePasswordApi.mockRejectedValue(
      new ApiError(400, 'bad', {
        code: 'PASSWORD_POLICY',
        details: ['PASSWORD_LENGTH', 'PASSWORD_COMMON'],
      }),
    );
    renderPage();
    await fill('old-pass', 'abc', 'abc');

    expect(
      await screen.findByText('Password must be between 8 and 100 characters.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Password is too common.')).toBeInTheDocument();
  });

  it('shows a single message for a wrong current password', async () => {
    changePasswordApi.mockRejectedValue(
      new ApiError(400, 'bad', { code: 'INVALID_CURRENT_PASSWORD' }),
    );
    renderPage();
    await fill('wrong', 'new-pass-1', 'new-pass-1');

    expect(await screen.findByText('Your current password is incorrect.')).toBeInTheDocument();
  });

  it('shows no error on 401 (the global handler redirects to login)', async () => {
    changePasswordApi.mockRejectedValue(new ApiError(401, 'expired', { code: 'UNAUTHORIZED' }));
    renderPage();
    await fill('old-pass', 'new-pass-1', 'new-pass-1');

    await vi.waitFor(() => {
      expect(changePasswordApi).toHaveBeenCalled();
    });
    expect(screen.queryByText(/session has expired/i)).not.toBeInTheDocument();
  });
});
