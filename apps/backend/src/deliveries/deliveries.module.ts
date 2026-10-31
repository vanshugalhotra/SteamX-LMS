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
import { DeliveryEnrollmentsController } from './enrollments/delivery-enrollments.controller.js';
import { DeliveryEnrollmentsRepository } from './enrollments/delivery-enrollments.repository.js';
import { DeliveryEnrollmentsService } from './enrollments/delivery-enrollments.service.js';
import { DeliveryAccessService } from './delivery-access.service.js';
import { DeliveryReleasesController } from './delivery-releases/delivery-releases.controller.js';
import { DeliveryReleasesRepository } from './delivery-releases/delivery-releases.repository.js';
import { DeliveryReleasesService } from './delivery-releases/delivery-releases.service.js';

@Module({
  imports: [PrismaModule, SubscriptionsModule, TenancyModule],
  controllers: [
    DeliveriesController,
    DeliveryTeachersController,
    DeliveryEnrollmentsController,
    DeliveryReleasesController,
  ],
  providers: [
    DeliveriesRepository,
    DeliveriesService,
    DeliveryTeachersRepository,
    DeliveryTeachersService,
    DeliveryEnrollmentsRepository,
    DeliveryEnrollmentsService,
    DeliveryAccessService,
    DeliveryReleasesRepository,
    DeliveryReleasesService,
  ],
})
export class DeliveriesModule {}
