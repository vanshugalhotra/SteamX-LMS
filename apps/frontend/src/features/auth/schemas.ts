import { z } from 'zod';

// Only "required" checks on login: the server owns credential and password-policy rules.
export const loginSchema = z.object({
  steamxId: z.string().trim().min(1, 'Enter your SteamX ID.'),
  password: z.string().min(1, 'Enter your password.'),
});

export type LoginValues = z.infer<typeof loginSchema>;
