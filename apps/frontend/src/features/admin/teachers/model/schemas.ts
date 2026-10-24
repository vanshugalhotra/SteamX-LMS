import { z } from 'zod';

// Limits mirror the backend DTOs (CreateTeacherDto).
const base = {
  name: z.string().trim().min(1, 'Enter the teacher’s name').max(120, 'Use at most 120 characters'),
  email: z
    .string()
    .trim()
    .max(254, 'Use at most 254 characters')
    .refine((v) => v === '' || z.email().safeParse(v).success, { message: 'Enter a valid email' }),
  primaryAssignment: z.string().trim().max(120, 'Use at most 120 characters'),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  // Read-only on edit, never sent.
  steamxId: z.string(),
  schoolName: z.string(),
};

export const createTeacherSchema = z.object({
  ...base,
  schoolId: z.string().min(1, 'Choose a school'),
  // The backend enforces the full policy; the rest is shown from its response.
  password: z.string().min(8, 'Use at least 8 characters').max(100, 'Use at most 100 characters'),
});

export const editTeacherSchema = z.object({ ...base, schoolId: z.string(), password: z.string() });

export type TeacherFormValues = z.infer<typeof createTeacherSchema>;
