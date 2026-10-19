import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/e2e/*.e2e-spec.ts'],
    setupFiles: [
      './test/support/setup/setup-env.ts',
      './test/support/setup/reset-test-database.ts',
    ],
    globalSetup: ['./test/support/setup/global-setup.ts'],
    fileParallelism: false,
  },
  resolve: {
    tsconfigPaths: true,
  },
});
