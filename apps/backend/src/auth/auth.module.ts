import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { FirstAdminService } from './first-admin.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [PrismaModule],
  providers: [FirstAdminService, PasswordService, TokenService],
  exports: [FirstAdminService, PasswordService, TokenService],
})
export class AuthModule {}
