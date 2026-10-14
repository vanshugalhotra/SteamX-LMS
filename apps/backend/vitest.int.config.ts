import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/db/**/*.int-spec.ts'],
    setupFiles: ['./test/setup/setup-env.ts'],
    globalSetup: ['./test/setup/global-setup.ts'],
    fileParallelism: false,
  },
  resolve: {
    tsconfigPaths: true,
  },
});
