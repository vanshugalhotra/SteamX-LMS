import { z } from 'zod';

// Limits mirror ClassSectionResponseDto (max 50).
export const classSectionSchema = z.object({
  schoolId: z.string().min(1, 'Choose a school'),
  className: z.string().trim().min(1, 'Enter the class').max(50, 'Use at most 50 characters'),
  sectionName: z.string().trim().min(1, 'Enter the section').max(50, 'Use at most 50 characters'),
});

export type ClassSectionFormValues = z.infer<typeof classSectionSchema>;
