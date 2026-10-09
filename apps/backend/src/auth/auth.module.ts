import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthContextRepository } from './auth-context.repository.js';
import { AuthGuard } from './auth.guard.js';
import { FirstAdminService } from './services/first-admin.service.js';
import { PasswordService } from './services/password.service.js';
import { TokenService } from './services/token.service.js';

@Module({
  imports: [PrismaModule],
  providers: [
    AuthContextRepository,
    AuthGuard,
    FirstAdminService,
    PasswordService,
    TokenService,
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
  exports: [PasswordService, TokenService],
})
export class AuthModule {}
