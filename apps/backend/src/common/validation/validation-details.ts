import type { ValidationError } from 'class-validator';

type FieldErrors = { field: string; errors: string[] };

const FIELD_LABELS: Record<string, string> = {
  academicYear: 'Academic year',
  classSectionId: 'Class section',
  contactEmail: 'Contact email',
  courseId: 'Course',
  endDate: 'End date',
  maxDeliveries: 'Maximum deliveries',
  schoolId: 'School',
  startDate: 'Start date',
  steamxId: 'SteamX ID',
};

function getFieldLabel(field: string): string {
  const label = FIELD_LABELS[field];
  if (label) {
    return label;
  }

  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/Id\b/g, 'ID')
    .replace(/^./, (character) => character.toUpperCase());
}

function getFormatMessage(field: string): string {
  if (field === 'academicYear') {
    return 'Enter the academic year in YYYY-YY format, such as 2026-27.';
  }
  if (field === 'code') {
    return 'Use 2 to 12 letters or numbers, with optional hyphens or underscores.';
  }
  if (field.toLowerCase().includes('date')) {
    return `Enter ${getFieldLabel(field).toLowerCase()} as a valid date in YYYY-MM-DD format.`;
  }
  if (field === 'steamxId') {
    return 'Enter a valid SteamX ID.';
  }
  return `${getFieldLabel(field)} has an invalid format.`;
}

function getConstraintMessage(field: string, constraint: string, original: string): string {
  const label = getFieldLabel(field);

  switch (constraint) {
    case 'whitelistValidation':
      return `${label} is not an allowed field.`;
    case 'isDefined':
      return `${label} is required.`;
    case 'isNotEmpty':
      return `${label} cannot be empty.`;
    case 'isString':
      return `${label} must be text.`;
    case 'isEmail':
      return `${label} must be a valid email address.`;
    case 'isUUID':
      if (field === 'schoolId') {
        return 'Select a valid school.';
      }
      if (field === 'courseId') {
        return 'Select a valid course.';
      }
      if (field === 'classSectionId') {
        return 'Select a valid class section.';
      }
      return `${label} must be a valid ID.`;
    case 'isInt':
      return `${label} must be a whole number.`;
    case 'isNumber':
      return `${label} must be a number.`;
    case 'isBoolean':
      return `${label} must be true or false.`;
    case 'isEnum':
    case 'isIn':
      return `Choose a valid ${label.toLowerCase()}.`;
    case 'isDateString':
      return getFormatMessage(field);
    case 'matches':
      return getFormatMessage(field);
    case 'isArray':
      return `${label} must be a list.`;
    case 'arrayNotEmpty':
      return `${label} must contain at least one item.`;
    case 'isObject':
      return `${label} must be an object.`;
    case 'isNotEmptyObject':
      return `${label} must contain at least one field.`;
    case 'min':
      return `${label} must be at least ${getConstraintNumber(original)}.`;
    case 'max':
      return `${label} cannot be greater than ${getConstraintNumber(original)}.`;
    case 'minLength':
      return `${label} must contain at least ${getConstraintNumber(original)} characters.`;
    case 'maxLength':
      return `${label} cannot be longer than ${getConstraintNumber(original)} characters.`;
    case 'arrayMinSize':
      return `${label} must contain at least ${getConstraintNumber(original)} items.`;
    case 'arrayMaxSize':
      return `${label} cannot contain more than ${getConstraintNumber(original)} items.`;
    case 'unknownValue':
      return `${label} is not valid.`;
    default:
      return original;
  }
}

function getConstraintNumber(message: string): string {
  return message.match(/\d+/)?.[0] ?? 'the allowed limit';
}

/** Converts class-validator output into short messages while retaining machine-readable field paths. */
export function getValidationDetails(errors: ValidationError[], parent = ''): FieldErrors[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const currentError =
      error.constraints === undefined
        ? []
        : [
            {
              field,
              errors: [
                ...new Set(
                  Object.entries(error.constraints).map(([constraint, message]) =>
                    getConstraintMessage(error.property, constraint, message),
                  ),
                ),
              ],
            },
          ];

    return [...currentError, ...getValidationDetails(error.children ?? [], field)];
  });
}
