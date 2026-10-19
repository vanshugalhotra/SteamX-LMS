import { expect } from 'vitest';
import type { Response } from 'supertest';

export function expectError(response: Response, status: number, code: string): void {
  expect(response.status).toBe(status);
  expect(response.body).toMatchObject({
    statusCode: status,
    code,
    message: expect.any(String),
    requestId: expect.any(String),
  });
  expect(Object.keys(response.body).sort()).toEqual(
    expect.arrayContaining(['statusCode', 'code', 'message', 'requestId']),
  );
  expect(
    Object.keys(response.body).every((key) =>
      ['statusCode', 'code', 'message', 'requestId', 'details'].includes(key),
    ),
  ).toBe(true);
  expect(response.body).not.toHaveProperty('stack');
}
