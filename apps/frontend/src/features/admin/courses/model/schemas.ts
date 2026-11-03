import { z } from 'zod';

export const courseSchema = z.object({
  title: z.string().trim().min(1, 'Enter a course title').max(200, 'Use at most 200 characters'),
  description: z.string().trim().max(2000, 'Use at most 2000 characters'),
});

export type CourseFormValues = z.infer<typeof courseSchema>;
