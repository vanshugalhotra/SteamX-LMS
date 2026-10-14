/**
 * Converts Prisma class sections into the public response shape.
 */
import type { ClassSection } from '../generated/prisma/client.js';
import type { ClassSectionResponseDto } from './dto/class-section-response.dto.js';

export function toClassSectionResponse(section: ClassSection): ClassSectionResponseDto {
  return {
    id: section.id,
    schoolId: section.schoolId,
    className: section.className,
    sectionName: section.sectionName,
    createdAt: section.createdAt,
    updatedAt: section.updatedAt,
  };
}
