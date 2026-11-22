import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATHS } from '@/lib/paths';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('react-router', () => ({ useNavigate: () => navigate }));
vi.mock('@/components/form/FormPageLayout', () => ({
  FormPageLayout: ({ children, title }: { children: ReactNode; title: string }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock('../components/DeliveryForm', () => ({
  DeliveryForm: ({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) => (
    <>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" onClick={onDone}>
        Delivery created
      </button>
    </>
  ),
}));

import { DeliveryCreatePage } from './DeliveryCreatePage';

describe('DeliveryCreatePage', () => {
  beforeEach(() => {
    navigate.mockReset();
  });

  it('returns to the delivery directory when cancelled or created', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DeliveryCreatePage />);

    expect(screen.getByRole('heading', { name: 'Create delivery' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(navigate).toHaveBeenCalledWith(PATHS.admin.deliveries);

    navigate.mockReset();
    rerender(<DeliveryCreatePage />);
    await user.click(screen.getByRole('button', { name: 'Delivery created' }));
    expect(navigate).toHaveBeenCalledWith(PATHS.admin.deliveries);
  });
});
