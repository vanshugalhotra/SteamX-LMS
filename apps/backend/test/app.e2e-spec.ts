import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/configure-app.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer()).get('/api/v1').expect(200).expect('Hello World!');
  });

  it('GET /health/live returns ok without prefix or version', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200).expect({ status: 'ok' });
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
