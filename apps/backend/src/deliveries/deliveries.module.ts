import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { TenancyModule } from '../common/tenancy/tenancy.module.js';
import { DeliveriesController } from './deliveries.controller.js';
import { DeliveriesRepository } from './deliveries.repository.js';
import { DeliveriesService } from './deliveries.service.js';

@Module({
  imports: [PrismaModule, SubscriptionsModule, TenancyModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesRepository, DeliveriesService],
})
export class DeliveriesModule {}
