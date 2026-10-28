import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ClassSectionsModule } from '../class-sections/class-sections.module.js';
import { TenancyModule } from '../common/tenancy/tenancy.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SchoolsModule } from '../schools/schools.module.js';
import { SteamxIdService } from './steamx-id/steamx-id.service.js';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

/** Wires user management to authentication, school, class-section, and tenancy services. */
@Module({
  imports: [AuthModule, ClassSectionsModule, SchoolsModule, TenancyModule, PrismaModule],
  controllers: [UsersController],
  providers: [SteamxIdService, UsersRepository, UsersService],
})
export class UsersModule {}
