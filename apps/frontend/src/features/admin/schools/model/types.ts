// Mirrors the backend SchoolResponseDto
export type SchoolStatus = 'ACTIVE' | 'INACTIVE';

export interface School {
  id: string;
  code: string;
  name: string;
  streetAddress: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: SchoolStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolListParams {
  page: number;
  limit: number;
  q: string;
  status: SchoolStatus | 'ALL';
}

export interface SchoolInput {
  name: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  streetAddress: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
}

export interface CreateSchoolPayload extends SchoolInput {
  code: string;
}

// TODO: these mirror the backend DTOs by hand. Generate them from Swagger
// (or share a typed API client) so they cannot drift.
export type SchoolStatusFilter = SchoolStatus | 'ALL';
