import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types.js';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/configure-app.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Health endpoints (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('GET /health/live returns ok without prefix or version', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200).expect({ status: 'ok' });
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(404);
  });

  it('GET /health/ready checks the real database and is skipped by request logging', async () => {
    const output: string[] = [];
    const write = vi.spyOn(process.stdout, 'write').mockImplementation((...args) => {
      output.push(String(args[0]));
      return true;
    });

    try {
      await request(app.getHttpServer()).get('/health/ready').expect(200).expect({ status: 'ok' });
      expect(output.join('')).not.toContain('/health/ready');
    } finally {
      write.mockRestore();
    }
  });

  it('GET /api/v1/health/ready is not under the API prefix', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(404);
  });

  it('returns only the database-down response when the readiness query fails', async () => {
    const prisma = app.get(PrismaService);
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(
      new Error('Sensitive database host and connection details'),
    );

    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503)
      .expect({ status: 'error', checks: { database: 'down' } });

    expect(JSON.stringify(response.body)).not.toContain('Sensitive database host');
  });

  afterEach(async () => {
    await app.close();
  });
});
