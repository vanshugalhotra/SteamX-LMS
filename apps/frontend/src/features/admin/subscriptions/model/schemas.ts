import { z } from 'zod';

export const subscriptionFormSchema = z
  .object({
    schoolId: z.string().min(1, 'Choose a school.'),
    courseId: z.string().min(1, 'Choose a course.'),
    startDate: z.string().min(1, 'Enter a start date.'),
    endDate: z.string().min(1, 'Enter an end date.'),
    maxDeliveries: z
      .number({ error: 'Enter a number greater than 0.' })
      .int('Enter a whole number.')
      .min(1, 'Enter a number greater than 0.'),
  })
  .superRefine(({ startDate, endDate }, context) => {
    if (startDate && endDate && endDate < startDate) {
      context.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'End date must be on or after the start date.',
      });
    }
  });

export type SubscriptionFormValues = z.infer<typeof subscriptionFormSchema>;
