import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthContextRepository } from './auth-context.repository.js';
import { AuthGuard } from './auth.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { FirstAdminService } from './services/first-admin.service.js';
import { PasswordService } from './services/password.service.js';
import { TokenService } from './services/token.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthContextRepository,
    AuthGuard,
    AuthService,
    FirstAdminService,
    PasswordService,
    TokenService,
  ],
  exports: [AuthGuard, AuthContextRepository, PasswordService, TokenService],
})
export class AuthModule {}
