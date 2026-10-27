import { z } from 'zod';

// Limits mirror ClassSectionResponseDto (max 50).
export const classSectionSchema = z.object({
  schoolId: z.string().min(1, 'Choose a school'),
  className: z.string().trim().min(1, 'Enter the class').max(50, 'Use at most 50 characters'),
  // Optional: the backend uses "All" when no section is given.
  sectionName: z.string().trim().max(50, 'Use at most 50 characters'),
});

export type ClassSectionFormValues = z.infer<typeof classSectionSchema>;
