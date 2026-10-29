import { z } from 'zod';

// Limits mirror the backend DTOs (max 50).
const className = z.string().trim().min(1, 'Enter the class').max(50, 'Use at most 50 characters');

export const createClassSectionSchema = z.object({
  schoolId: z.string().min(1, 'Choose a school'),
  className,
  // Optional on create: the backend uses "All" when it is not sent.
  sectionName: z.string().trim().max(50, 'Use at most 50 characters'),
  schoolName: z.string(),
});

// The backend rejects an empty section name on update, so it is required on edit.
export const editClassSectionSchema = z.object({
  schoolId: z.string(),
  className,
  sectionName: z.string().trim().min(1, 'Enter the section').max(50, 'Use at most 50 characters'),
  schoolName: z.string(),
});

export type ClassSectionFormValues = z.infer<typeof createClassSectionSchema>;
