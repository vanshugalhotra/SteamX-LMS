import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/configure-app.js';

export async function createTestApp(
  rootModule: Type<unknown> = AppModule,
): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({ imports: [rootModule] }).compile();
  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}
