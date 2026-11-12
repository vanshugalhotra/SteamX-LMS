import type { ValidationError } from 'class-validator';
import { getValidationDetails } from './validation-details.js';

describe('getValidationDetails', () => {
  it('converts standard validator errors into clear field messages', () => {
    const errors: ValidationError[] = [
      {
        property: 'schoolId',
        constraints: { isUUID: 'schoolId must be a UUID' },
        children: [],
      },
      {
        property: 'maxDeliveries',
        constraints: { min: 'maxDeliveries must not be less than 1' },
        children: [],
      },
      {
        property: 'extra',
        constraints: { whitelistValidation: 'property extra should not exist' },
        children: [],
      },
    ];

    expect(getValidationDetails(errors)).toEqual([
      { field: 'schoolId', errors: ['Select a valid school.'] },
      { field: 'maxDeliveries', errors: ['Maximum deliveries must be at least 1.'] },
      { field: 'extra', errors: ['Extra is not an allowed field.'] },
    ]);
  });

  it('keeps nested field paths and gives domain formats useful examples', () => {
    const errors: ValidationError[] = [
      {
        property: 'subscription',
        constraints: undefined,
        children: [
          {
            property: 'academicYear',
            constraints: { matches: 'academicYear must match the required format' },
            children: [],
          },
        ],
      },
    ];

    expect(getValidationDetails(errors)).toEqual([
      {
        field: 'subscription.academicYear',
        errors: ['Enter the academic year in YYYY-YY format, such as 2026-27.'],
      },
    ]);
  });

  it('removes duplicate messages produced by multiple date validators', () => {
    const errors: ValidationError[] = [
      {
        property: 'startDate',
        constraints: {
          matches: 'startDate must match the required format',
          isDateString: 'startDate must be a valid ISO 8601 date string',
        },
        children: [],
      },
    ];

    expect(getValidationDetails(errors)).toEqual([
      {
        field: 'startDate',
        errors: ['Enter start date as a valid date in YYYY-MM-DD format.'],
      },
    ]);
  });
});
