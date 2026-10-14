import type { School } from '../generated/prisma/client.js';
import type { SchoolResponseDto } from './dto/school-response.dto.js';

export function toSchoolResponse(school: School): SchoolResponseDto {
  return {
    id: school.id,
    code: school.code,
    name: school.name,
    streetAddress: school.streetAddress,
    city: school.city,
    state: school.state,
    postalCode: school.postalCode,
    country: school.country,
    contactName: school.contactName,
    contactEmail: school.contactEmail,
    contactPhone: school.contactPhone,
    status: school.status,
    createdAt: school.createdAt,
    updatedAt: school.updatedAt,
  };
}
