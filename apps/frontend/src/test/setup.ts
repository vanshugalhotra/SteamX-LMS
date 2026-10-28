import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: { VITE_API_URL: 'http://localhost:3000' },
}));
