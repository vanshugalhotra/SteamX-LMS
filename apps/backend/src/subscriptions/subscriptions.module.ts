import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { CourseAccessService } from './course-access.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsRepository, SubscriptionsService, CourseAccessService],
  exports: [CourseAccessService],
})
export class SubscriptionsModule {}
