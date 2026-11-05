import { Module } from '@nestjs/common';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { DeliveriesModule } from '../deliveries/deliveries.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { LearningAccessRepository } from './learning-access.repository.js';
import { LearningAccessService } from './learning-access.service.js';
import { LearningController } from './learning.controller.js';
import { LearningService } from './learning.service.js';

@Module({
  imports: [PrismaModule, SubscriptionsModule, DeliveriesModule, CurriculumModule],
  controllers: [LearningController],
  providers: [LearningAccessRepository, LearningAccessService, LearningService],
  exports: [LearningAccessService],
})
export class LearningModule {}
