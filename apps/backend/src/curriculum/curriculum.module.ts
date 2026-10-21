import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CoursesController } from './courses/courses.controller.js';
import { CoursesRepository } from './courses/courses.repository.js';
import { CoursesService } from './courses/courses.service.js';
import { CourseModulesController } from './course-modules/course-modules.controller.js';
import { CourseModulesRepository } from './course-modules/course-modules.repository.js';
import { CourseModulesService } from './course-modules/course-modules.service.js';
import { LessonsController } from './lessons/lessons.controller.js';
import { LessonsRepository } from './lessons/lessons.repository.js';
import { LessonsService } from './lessons/lessons.service.js';
import { CourseOutlineController } from './outline/course-outline.controller.js';
import { CourseOutlineRepository } from './outline/course-outline.repository.js';
import { CourseOutlineService } from './outline/course-outline.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [
    CoursesController,
    CourseModulesController,
    LessonsController,
    CourseOutlineController,
  ],
  providers: [
    CoursesRepository,
    CoursesService,
    CourseModulesRepository,
    CourseModulesService,
    LessonsRepository,
    LessonsService,
    CourseOutlineRepository,
    CourseOutlineService,
  ],
})
export class CurriculumModule {}
