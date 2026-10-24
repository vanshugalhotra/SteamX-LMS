import { config } from 'dotenv';

const testEnv = config({ path: '.env.test', quiet: true });
if (testEnv.error || !testEnv.parsed) {
  throw new Error('Could not load the required .env.test file.');
}

process.env.ASSET_ACCESS_TTL_IMAGE_SECONDS ??= '600';
process.env.ASSET_ACCESS_TTL_PDF_SECONDS ??= '1800';
process.env.ASSET_ACCESS_TTL_VIDEO_SECONDS ??= '7200';

export function getTestDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set in .env.test or the test environment.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL for a test database.');
  }

  const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
  if (
    !['postgres:', 'postgresql:'].includes(parsedUrl.protocol) ||
    !/(?:^|_)test$/i.test(databaseName)
  ) {
    throw new Error(
      'Refusing to run tests unless DATABASE_URL targets a *_test PostgreSQL database.',
    );
  }

  return databaseUrl;
}

getTestDatabaseUrl();
