import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { validateEnv } from './config/env.schema.js';
import { HealthModule } from './health/health.module.js';
import { LoggingModule } from './logging/logging.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    AuthModule,
    LoggingModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
