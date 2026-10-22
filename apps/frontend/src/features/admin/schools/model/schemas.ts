import { z } from 'zod';

// Limits mirror the backend CreateSchoolDto.
const required = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}`)
    .max(max, `Use at most ${String(max)} characters`);

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${String(max)} characters`);

const shared = {
  name: required('school name', 120),
  city: required('city', 100),
  state: required('state', 100),
  postalCode: required('postal code', 20),
  country: required('country', 100),
  streetAddress: optional(255),
  contactName: optional(120),
  contactPhone: optional(32),
  contactEmail: optional(254).refine((v) => v === '' || z.email().safeParse(v).success, {
    message: 'Enter a valid email',
  }),
};

const statusSchema = z.enum(['ACTIVE', 'INACTIVE']);

export const createSchoolSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9][A-Z0-9_-]{1,11}$/,
      'Use 2 to 12 letters, numbers, "-" or "_", starting with a letter or number',
    ),
  ...shared,
  status: statusSchema,
});

// The code is read-only on edit, so it is not validated.
export const editSchoolSchema = z.object({
  code: z.string(),
  ...shared,
  status: statusSchema,
});

export type SchoolFormValues = z.infer<typeof createSchoolSchema>;
