/** Runs the fixed manual-testing seed against an empty development database only. */
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../../../src/generated/prisma/client.js';
import { seedAssets } from './assets.js';
import { seedCurriculum } from './curriculum.js';
import { DEV_PASSWORD, seedIdentity } from './identity.js';
import { seedSubscriptionsAndDeliveries } from './subscriptions-deliveries.js';

function assertSafeTarget(): string {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the testing seed when NODE_ENV=production.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required; set it to a development database.');
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must point to PostgreSQL.');
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (/(^|[_.-])test/i.test(databaseName)) {
    throw new Error('Refusing to seed a test database; point DATABASE_URL at a dev database.');
  }
  return databaseUrl;
}

async function assertEmptyDatabase(prisma: PrismaClient): Promise<void> {
  const [schools, users, courses, assets, subscriptions, deliveries] = await Promise.all([
    prisma.school.count(),
    prisma.user.count(),
    prisma.course.count(),
    prisma.asset.count(),
    prisma.subscription.count(),
    prisma.delivery.count(),
  ]);
  if (schools + users + courses + assets + subscriptions + deliveries > 0) {
    throw new Error(
      'The development database already contains application data. Reset it before seeding.',
    );
  }
}

async function main(): Promise<void> {
  const connectionString = assertSafeTarget();
  const pool = new Pool({ connectionString, application_name: 'steamx-dev-seed' });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    await prisma.$connect();
    await assertEmptyDatabase(prisma);

    const identity = await seedIdentity(prisma);
    const assets = await seedAssets(prisma);
    const curriculum = await seedCurriculum(prisma, assets);
    const deliverySummary = await seedSubscriptionsAndDeliveries(prisma, identity, curriculum);

    console.log('\nDevelopment seed complete');
    console.log('2 schools; 6 class sections; 19 users (1 admin, 6 teachers, 12 students).');
    console.log('7 courses; 3 modules; 5 lessons; 9 lesson blocks.');
    console.log('8 assets; 8 asset files; 7 subscriptions.');
    console.log(
      `${deliverySummary.deliveries} deliveries; ${deliverySummary.deliveryTeacherStints} delivery-teacher history rows.`,
    );
    if (deliverySummary.skippedScenarios.length > 0) {
      console.log('\nSkipped scenarios:');
      for (const scenario of deliverySummary.skippedScenarios) console.log(`- ${scenario}`);
    } else {
      console.log('Skipped scenarios: none.');
    }

    console.log(`\nShared development password: ${DEV_PASSWORD}`);
    console.table(identity.loginRows);
  } finally {
    try {
      await prisma.$disconnect();
    } finally {
      await pool.end();
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`Development seed failed: ${message}`);
  process.exitCode = 1;
});
