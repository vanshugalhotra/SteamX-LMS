import { describe, expect, it } from 'vitest';
import { courseSchema } from './schemas';

describe('courseSchema', () => {
  it('requires a title and trims surrounding whitespace', () => {
    expect(courseSchema.safeParse({ title: '   ', description: '' }).success).toBe(false);
    expect(courseSchema.parse({ title: '  Robotics  ', description: '' })).toEqual({
      title: 'Robotics',
      description: '',
    });
  });

  it('enforces the backend title and description limits', () => {
    expect(
      courseSchema.safeParse({ title: 'x'.repeat(200), description: 'x'.repeat(2000) }).success,
    ).toBe(true);
    expect(courseSchema.safeParse({ title: 'x'.repeat(201), description: '' }).success).toBe(false);
    expect(
      courseSchema.safeParse({ title: 'Valid title', description: 'x'.repeat(2001) }).success,
    ).toBe(false);
  });
});
