import { z } from 'zod';

// Limits mirror the backend DTOs (CreateStudentDto).
const base = {
  name: z.string().trim().min(1, 'Enter the student’s name').max(120, 'Use at most 120 characters'),
  guardianName: z.string().trim().max(120, 'Use at most 120 characters'),
  // TODO: Make it required when class section exists
  classSectionId: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  // Read-only on edit, never sent.
  steamxId: z.string(),
  schoolName: z.string(),
};

export const createStudentSchema = z.object({
  ...base,
  schoolId: z.string().min(1, 'Choose a school'),
  // The backend enforces the full policy; the rest is shown from its response.
  password: z.string().min(8, 'Use at least 8 characters').max(100, 'Use at most 100 characters'),
});

export const editStudentSchema = z.object({ ...base, schoolId: z.string(), password: z.string() });

export type StudentFormValues = z.infer<typeof createStudentSchema>;
