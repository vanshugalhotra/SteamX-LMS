import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFirstAdminInput } from '../auth/helpers/first-admin-input.js';
import { FirstAdminService } from '../auth/services/first-admin.service.js';
import { FirstAdminError } from '../auth/types/first-admin.js';

const ADMIN_CREATE_USAGE = 'Usage: pnpm --filter @steamx/backend admin:create [--reset]';

export async function runAdminCreate(
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const reset = args.length === 1 && args[0] === '--reset';
  if (args.length > 0 && !reset) {
    throw new FirstAdminError(ADMIN_CREATE_USAGE);
  }

  const input = readFirstAdminInput(environment);
  const { AppModule } = await import('../app.module.js');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  try {
    const firstAdmin = app.get(FirstAdminService);
    if (reset) {
      const steamxId = await firstAdmin.resetAdminPassword(input);
      return `password reset for ${steamxId}`;
    }

    const result = await firstAdmin.create(input);
    if (result.created) {
      return `Created the first admin account for ${result.steamxId}.`;
    }

    return `Admin account ${result.steamxId} already exists; no account was created. To reset its password, rerun with --reset.`;
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  try {
    const output = await runAdminCreate(process.argv.slice(2));
    process.stdout.write(`${output}\n`);
  } catch (error: unknown) {
    if (error instanceof FirstAdminError) {
      process.stderr.write(`${error.message}\n`);
    } else {
      process.stderr.write(
        'Admin command failed. Check the database connection and run `pnpm --filter @steamx/backend migrate:deploy` if migrations are pending.\n',
      );
    }
    process.exitCode = 1;
  }
}

const entryPoint = process.argv[1];
if (
  entryPoint &&
  realpathSync(resolve(entryPoint)) === realpathSync(fileURLToPath(import.meta.url))
) {
  await main();
}
