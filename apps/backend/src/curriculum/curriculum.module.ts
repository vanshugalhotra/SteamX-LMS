import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CoursesController } from './courses/courses.controller.js';
import { CoursesRepository } from './courses/courses.repository.js';
import { CoursesService } from './courses/courses.service.js';
import { CourseModulesController } from './course-modules/course-modules.controller.js';
import { CourseModulesRepository } from './course-modules/course-modules.repository.js';
import { CourseModulesService } from './course-modules/course-modules.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [CoursesController, CourseModulesController],
  providers: [CoursesRepository, CoursesService, CourseModulesRepository, CourseModulesService],
})
export class CurriculumModule {}
