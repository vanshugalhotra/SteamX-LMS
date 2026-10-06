import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types.js';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/configure-app.js';

describe('Request logging (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('reuses a valid request ID and returns it in the response', () => {
    const requestId = 'a84f4a1f-746d-4e64-9841-c99d5d6ced31';

    return request(app.getHttpServer())
      .get('/api/v1/not-found')
      .set('X-Request-Id', requestId)
      .expect(404)
      .expect('X-Request-Id', requestId);
  });

  it('generates a UUID when the incoming request ID is invalid', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/not-found')
      .set('X-Request-Id', 'untrusted-value')
      .expect(404);

    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  afterEach(async () => {
    await app.close();
  });
});
