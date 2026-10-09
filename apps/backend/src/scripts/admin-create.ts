import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { readFirstAdminInput } from '../auth/helpers/first-admin-input.js';
import { FirstAdminService } from '../auth/services/first-admin.service.js';
import { FirstAdminError } from '../auth/types/first-admin.js';

async function main(): Promise<void> {
  const input = readFirstAdminInput(process.env);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  try {
    const result = await app.get(FirstAdminService).create(input);

    if (result.created) {
      process.stdout.write(`Created the first admin account for ${result.steamxId}.\n`);
    } else {
      process.stdout.write(
        `Admin account ${result.steamxId} already exists; no account was created.\n`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof FirstAdminError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write(
      'Admin creation failed. Check the database connection and run `pnpm --filter @steamx/backend migrate:deploy` if migrations are pending.\n',
    );
  }
  process.exitCode = 1;
});
