import { Module } from '@nestjs/common';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { DeliveriesModule } from '../deliveries/deliveries.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { AssignmentPublishingService } from './delivery/assignment-publishing.service.js';
import { AssignmentTemplateCopyService } from './delivery/assignment-template-copy.service.js';
import { DeliveryAssignmentAccessService } from './delivery/delivery-assignment-access.service.js';
import { DeliveryAssignmentEditsService } from './delivery/delivery-assignment-edits.service.js';
import { DeliveryAssignmentsController } from './delivery/delivery-assignments.controller.js';
import { DeliveryAssignmentsRepository } from './delivery/delivery-assignments.repository.js';
import { DeliveryAssignmentsService } from './delivery/delivery-assignments.service.js';
import { AssignmentsController } from './assignments.controller.js';
import { AssignmentsService } from './assignments.service.js';
import { AssignmentTemplatesController } from './assignment-template/assignment-templates.controller.js';
import { AssignmentTemplatesRepository } from './assignment-template/assignment-templates.repository.js';
import { AssignmentTemplatesService } from './assignment-template/assignment-templates.service.js';

@Module({
  imports: [PrismaModule, CurriculumModule, DeliveriesModule, SubscriptionsModule],
  controllers: [
    AssignmentsController,
    AssignmentTemplatesController,
    DeliveryAssignmentsController,
  ],
  providers: [
    AssignmentsService,
    AssignmentTemplatesRepository,
    AssignmentTemplatesService,
    DeliveryAssignmentAccessService,
    DeliveryAssignmentEditsService,
    DeliveryAssignmentsRepository,
    DeliveryAssignmentsService,
    AssignmentTemplateCopyService,
    AssignmentPublishingService,
  ],
})
export class AssignmentsModule {}
