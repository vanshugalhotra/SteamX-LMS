import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/configure-app.js';
import { HealthService } from '../../src/health/health.service.js';

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

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('GET /health/live returns ok without prefix or version', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200).expect({ status: 'ok' });
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(404);
  });

  it('GET /health/ready returns ok when the database is reachable', async () => {
    await request(app.getHttpServer()).get('/health/ready').expect(200).expect({ status: 'ok' });
  });

  it('GET /api/v1/health/ready is not under the API prefix', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(404);
  });

  it('returns the database-down response when the readiness check fails', async () => {
    vi.spyOn(app.get(HealthService), 'isDatabaseReady').mockResolvedValue(false);

    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503)
      .expect({ status: 'error', checks: { database: 'down' } });

    expect(response.body).not.toHaveProperty('stack');
  });
});
