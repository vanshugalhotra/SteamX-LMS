import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Env } from '../../src/config/env.schema.js';

type LoginUser = {
  steamxId: string;
  password: string;
};

export async function loginAs(
  app: INestApplication<App>,
  user: LoginUser,
  password = user.password,
): Promise<string> {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const origin = config.get('CORS_ORIGINS', { infer: true })[0];
  if (!origin) {
    throw new Error('E2E login requires at least one configured CORS_ORIGINS entry.');
  }

  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .send({ steamxId: user.steamxId, password })
    .expect(200);
  const setCookie = response.headers['set-cookie']?.[0];
  if (!setCookie) {
    throw new Error('Login response did not set a session cookie.');
  }

  return setCookie.split(';', 1)[0]!;
}
