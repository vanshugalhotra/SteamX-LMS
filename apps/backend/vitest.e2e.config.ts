import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/e2e/**/*.e2e-spec.ts', 'test/invariants/**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup/setup-env.ts'],
    globalSetup: ['./test/setup/global-setup.ts'],
    fileParallelism: false,
  },
  resolve: {
    tsconfigPaths: true,
  },
});
