import { describe, expect, it } from 'vitest';
import { getAllowedCourseStatusTransitions } from './status-transitions';

describe('getAllowedCourseStatusTransitions', () => {
  it('allows draft courses to be published or archived', () => {
    expect(getAllowedCourseStatusTransitions('DRAFT')).toEqual(['ACTIVE', 'ARCHIVED']);
  });

  it('allows published courses to be archived', () => {
    expect(getAllowedCourseStatusTransitions('ACTIVE')).toEqual(['ARCHIVED']);
  });

  it('allows archived courses to be published again', () => {
    expect(getAllowedCourseStatusTransitions('ARCHIVED')).toEqual(['ACTIVE']);
  });
});
