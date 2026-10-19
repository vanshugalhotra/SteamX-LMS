import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import './setup-env.js';

const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const prismaCliPath = resolve(backendDirectory, 'node_modules/prisma/build/index.js');

export default async function setup(): Promise<void> {
  const migration = spawnSync(process.execPath, [prismaCliPath, 'migrate', 'deploy'], {
    cwd: backendDirectory,
    stdio: 'inherit',
    env: process.env,
  });

  if (migration.error) {
    throw new Error('Could not start Prisma migrations before tests.', { cause: migration.error });
  }
  if (migration.status !== 0) {
    throw new Error('Prisma migrate deploy failed before tests.');
  }
}
