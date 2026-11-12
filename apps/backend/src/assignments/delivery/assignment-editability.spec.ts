import { describe, expect, it } from 'vitest';
import { AssignmentStatus } from '../../generated/prisma/client.js';
import { isAssignmentContentEditable } from './assignment-editability.js';

describe('isAssignmentContentEditable', () => {
  it.each([
    [AssignmentStatus.DRAFT, false, false, true],
    [AssignmentStatus.DRAFT, false, true, false],
    [AssignmentStatus.DRAFT, true, false, false],
    [AssignmentStatus.DRAFT, true, true, false],
    [AssignmentStatus.PUBLISHED, false, false, false],
    [AssignmentStatus.PUBLISHED, false, true, false],
    [AssignmentStatus.PUBLISHED, true, false, false],
    [AssignmentStatus.PUBLISHED, true, true, false],
    [AssignmentStatus.UNPUBLISHED, false, false, true],
    [AssignmentStatus.UNPUBLISHED, false, true, false],
    [AssignmentStatus.UNPUBLISHED, true, false, false],
    [AssignmentStatus.UNPUBLISHED, true, true, false],
  ])('status=%s submissions=%s templateCopy=%s => %s', (status, submissions, copy, expected) => {
    expect(isAssignmentContentEditable(status, submissions, copy)).toBe(expected);
  });
});
