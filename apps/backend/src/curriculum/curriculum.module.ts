import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CoursesController } from './courses/courses.controller.js';
import { CoursesRepository } from './courses/courses.repository.js';
import { CoursesService } from './courses/courses.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [CoursesController],
  providers: [CoursesRepository, CoursesService],
})
export class CurriculumModule {}
