import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module.js';
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
import { LessonContentController } from './lesson-content/lesson-content.controller.js';
import { LessonContentRepository } from './lesson-content/lesson-content.repository.js';
import { LessonContentService } from './lesson-content/lesson-content.service.js';

@Module({
  imports: [PrismaModule, AssetsModule],
  controllers: [
    CoursesController,
    CourseModulesController,
    LessonsController,
    CourseOutlineController,
    LessonContentController,
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
    LessonContentRepository,
    LessonContentService,
  ],
})
export class CurriculumModule {}
