import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { TenancyModule } from '../common/tenancy/tenancy.module.js';
import { DeliveriesController } from './deliveries.controller.js';
import { DeliveriesRepository } from './deliveries.repository.js';
import { DeliveriesService } from './deliveries.service.js';
import { DeliveryTeachersController } from './delivery-teacher/delivery-teachers.controller.js';
import { DeliveryTeachersRepository } from './delivery-teacher/delivery-teachers.repository.js';
import { DeliveryTeachersService } from './delivery-teacher/delivery-teachers.service.js';

@Module({
  imports: [PrismaModule, SubscriptionsModule, TenancyModule],
  controllers: [DeliveriesController, DeliveryTeachersController],
  providers: [
    DeliveriesRepository,
    DeliveriesService,
    DeliveryTeachersRepository,
    DeliveryTeachersService,
  ],
})
export class DeliveriesModule {}
