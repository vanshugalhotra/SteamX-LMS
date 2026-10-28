import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { S3_CLIENT, S3StorageService, createS3Client } from './s3-storage.service.js';
import { StorageService } from './storage.service.js';
import { StorageCleanupQueueService } from './storage-cleanup-queue.service.js';

/** Provides the S3-backed StorageService and the database-backed cleanup queue. */
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: S3_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const storage = config.get('storage', { infer: true });
        return createS3Client({
          region: storage.region,
          accessKeyId: storage.accessKeyId,
          secretAccessKey: storage.secretAccessKey,
        });
      },
    },
    S3StorageService,
    { provide: StorageService, useExisting: S3StorageService },
    StorageCleanupQueueService,
  ],
  exports: [StorageService, StorageCleanupQueueService],
})
export class StorageModule {}
