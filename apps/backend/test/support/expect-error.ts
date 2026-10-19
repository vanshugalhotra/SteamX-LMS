import { expect } from 'vitest';
import type { Response } from 'supertest';

export function expectError(response: Response, status: number, code: string): void {
  expect(response.status).toBe(status);
  expect(response.body).toEqual({
    statusCode: status,
    code,
    message: expect.any(String),
    requestId: expect.any(String),
  });
  expect(response.body).not.toHaveProperty('stack');
}
