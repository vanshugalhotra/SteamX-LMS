import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SchoolsController } from './schools.controller.js';
import { SchoolsRepository } from './schools.repository.js';
import { SchoolsService } from './schools.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [SchoolsController],
  providers: [SchoolsRepository, SchoolsService],
  exports: [SchoolsService],
})
export class SchoolsModule {}
