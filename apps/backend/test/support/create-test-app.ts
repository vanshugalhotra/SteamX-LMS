import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/configure-app.js';
import { StorageService } from '../../src/storage/storage.service.js';
import { InMemoryStorageService } from './in-memory-storage.service.js';

export async function createTestApp(
  rootModule: Type<unknown> = AppModule,
): Promise<INestApplication> {
  const storage = new InMemoryStorageService();
  const moduleFixture = await Test.createTestingModule({ imports: [rootModule] })
    .overrideProvider(StorageService)
    .useValue(storage)
    .compile();
  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export function getTestStorageService(app: INestApplication): InMemoryStorageService {
  return app.get<InMemoryStorageService>(StorageService);
}
