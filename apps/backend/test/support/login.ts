import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { Env } from '../../src/config/env.schema.js';

type LoginUser = {
  steamxId: string;
  password: string;
};

type LoginResult = {
  agent: ReturnType<typeof request.agent>;
  cookie: string;
};

async function createLogin(
  app: INestApplication,
  user: LoginUser,
  password = user.password,
): Promise<LoginResult> {
  const origin = app.get<ConfigService<Env, true>>(ConfigService).get('CORS_ORIGINS', {
    infer: true,
  })[0];
  if (!origin) {
    throw new Error('E2E login requires at least one configured CORS_ORIGINS entry.');
  }

  const agent = request.agent(app.getHttpServer());
  const response = await agent
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .send({ steamxId: user.steamxId, password })
    .expect(200);
  const setCookie = response.headers['set-cookie']?.[0];
  if (!setCookie) {
    throw new Error('Login response did not set a session cookie.');
  }
  return { agent, cookie: setCookie.split(';', 1)[0]! };
}

export async function loginAs(
  app: INestApplication,
  user: LoginUser,
  password = user.password,
): Promise<ReturnType<typeof request.agent>> {
  return (await createLogin(app, user, password)).agent;
}

export async function loginAsCookie(
  app: INestApplication,
  user: LoginUser,
  password = user.password,
): Promise<string> {
  return (await createLogin(app, user, password)).cookie;
}
