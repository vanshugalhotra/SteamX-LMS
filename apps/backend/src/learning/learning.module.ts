import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module.js';
import { AssignmentsModule } from '../assignments/assignments.module.js';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { DeliveriesModule } from '../deliveries/deliveries.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { LearningAccessRepository } from './learning-access.repository.js';
import { LearningAccessService } from './learning-access.service.js';
import { LearningController } from './learning.controller.js';
import { LearningService } from './learning.service.js';
import { StudentAssignmentsController } from './assignments/student-assignments.controller.js';
import { StudentAssignmentsService } from './assignments/student-assignments.service.js';
import { StudentSubmissionsRepository } from './assignments/student-submissions.repository.js';
import { StudentSubmissionsService } from './assignments/student-submissions.service.js';

@Module({
  imports: [
    PrismaModule,
    SubscriptionsModule,
    DeliveriesModule,
    CurriculumModule,
    AssetsModule,
    AssignmentsModule,
  ],
  controllers: [LearningController, StudentAssignmentsController],
  providers: [
    LearningAccessRepository,
    LearningAccessService,
    LearningService,
    StudentAssignmentsService,
    StudentSubmissionsRepository,
    StudentSubmissionsService,
  ],
  exports: [LearningAccessService],
})
export class LearningModule {}
