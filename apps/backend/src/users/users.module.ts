import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ClassSectionsModule } from '../class-sections/class-sections.module.js';
import { TenancyModule } from '../common/tenancy/tenancy.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SteamxIdService } from './steamx-id.service.js';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AuthModule, ClassSectionsModule, TenancyModule, PrismaModule],
  controllers: [UsersController],
  providers: [SteamxIdService, UsersRepository, UsersService],
})
export class UsersModule {}
