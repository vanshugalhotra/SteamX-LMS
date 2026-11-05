import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: { VITE_API_URL: 'http://localhost:3000' },
}));

Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
  configurable: true,
  value(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  },
});

Object.defineProperty(HTMLDialogElement.prototype, 'close', {
  configurable: true,
  value(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  },
});
