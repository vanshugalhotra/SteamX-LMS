/**
 * Connects the class-section routes and services to Prisma.
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ClassSectionsController } from './class-sections.controller.js';
import { ClassSectionsRepository } from './class-sections.repository.js';
import { ClassSectionsService } from './class-sections.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [ClassSectionsController],
  providers: [ClassSectionsRepository, ClassSectionsService],
})
export class ClassSectionsModule {}
