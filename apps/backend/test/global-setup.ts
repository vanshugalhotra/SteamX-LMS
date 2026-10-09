import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import './setup-env.js';

const prismaCliPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../node_modules/prisma/build/index.js',
);

export default function setup(): void {
  const migration = spawnSync(process.execPath, [prismaCliPath, 'migrate', 'deploy'], {
    stdio: 'inherit',
  });

  if (migration.error) {
    throw new Error('Could not start Prisma migrations before e2e tests.', {
      cause: migration.error,
    });
  }

  if (migration.status !== 0) {
    throw new Error('Prisma migrate deploy failed before e2e tests.');
  }
}
