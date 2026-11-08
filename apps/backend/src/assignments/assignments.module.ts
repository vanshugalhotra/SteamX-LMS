import { Module } from '@nestjs/common';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AssignmentsController } from './assignments.controller.js';
import { AssignmentsService } from './assignments.service.js';
import { AssignmentTemplatesController } from './assignment-template/assignment-templates.controller.js';
import { AssignmentTemplatesRepository } from './assignment-template/assignment-templates.repository.js';
import { AssignmentTemplatesService } from './assignment-template/assignment-templates.service.js';

@Module({
  imports: [PrismaModule, CurriculumModule],
  controllers: [AssignmentsController, AssignmentTemplatesController],
  providers: [AssignmentsService, AssignmentTemplatesRepository, AssignmentTemplatesService],
})
export class AssignmentsModule {}
