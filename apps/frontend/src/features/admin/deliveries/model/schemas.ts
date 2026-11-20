import { z } from 'zod';

export const deliveryFormSchema = z.object({
  schoolId: z.string().min(1, 'Choose a school.'),
  courseId: z.string().min(1, 'Choose a course.'),
  academicYear: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, 'Enter the academic year in YYYY-YY format, such as 2026-27.'),
  label: z.string().trim().min(1, 'Enter a delivery name.').max(100, 'Use at most 100 characters.'),
});

export type DeliveryFormValues = z.infer<typeof deliveryFormSchema>;
