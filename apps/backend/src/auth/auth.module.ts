import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthContextRepository } from './auth-context.repository.js';
import { AuthGuard } from './guards/auth.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PermissionGuard } from './guards/permission.guard.js';
import { PermissionsService } from './services/permissions.service.js';
import { UserPasswordController } from './user-password.controller.js';
import { FirstAdminService } from './services/first-admin.service.js';
import { PasswordService } from './services/password.service.js';
import { TokenService } from './services/token.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController, UserPasswordController],
  providers: [
    AuthContextRepository,
    AuthGuard,
    AuthService,
    FirstAdminService,
    PermissionGuard,
    PermissionsService,
    PasswordService,
    TokenService,
  ],
  exports: [AuthGuard, AuthContextRepository, PasswordService, PermissionGuard, TokenService],
})
export class AuthModule {}
