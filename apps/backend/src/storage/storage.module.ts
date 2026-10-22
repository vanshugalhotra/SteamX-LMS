import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { S3_CLIENT, S3StorageService, createS3Client } from './s3-storage.service.js';
import { StorageService } from './storage.service.js';

@Module({
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
  ],
  exports: [StorageService],
})
export class StorageModule {}
