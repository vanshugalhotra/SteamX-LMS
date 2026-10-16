import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TenancyModule } from '../common/tenancy/tenancy.module.js';
import { ClassSectionsController } from './class-sections.controller.js';
import { ClassSectionsRepository } from './class-sections.repository.js';
import { ClassSectionsService } from './class-sections.service.js';

@Module({
  imports: [PrismaModule, TenancyModule],
  controllers: [ClassSectionsController],
  providers: [ClassSectionsRepository, ClassSectionsService],
  exports: [ClassSectionsService],
})
export class ClassSectionsModule {}
