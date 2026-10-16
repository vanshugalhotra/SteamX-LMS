import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { ActiveSchoolService } from './active-school.service.js';

@Module({
  imports: [PrismaModule],
  providers: [ActiveSchoolService],
  exports: [ActiveSchoolService],
})
export class TenancyModule {}
