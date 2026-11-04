import { Module } from '@nestjs/common';
import { DeliveriesModule } from '../deliveries/deliveries.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { LearningAccessRepository } from './learning-access.repository.js';
import { LearningAccessService } from './learning-access.service.js';

@Module({
  imports: [PrismaModule, SubscriptionsModule, DeliveriesModule],
  providers: [LearningAccessRepository, LearningAccessService],
  exports: [LearningAccessService],
})
export class LearningModule {}
