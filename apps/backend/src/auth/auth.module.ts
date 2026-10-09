import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { FirstAdminService } from './services/first-admin.service.js';
import { PasswordService } from './services/password.service.js';
import { TokenService } from './services/token.service.js';

@Module({
  imports: [PrismaModule],
  providers: [FirstAdminService, PasswordService, TokenService],
  exports: [PasswordService, TokenService],
})
export class AuthModule {}
