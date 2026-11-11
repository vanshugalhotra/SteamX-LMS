/** Rejects assignment anchors that name both a module and a lesson. */
import {
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'oneTemplateAnchor', async: false })
export class OneAssignmentAnchorConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const body = args.object as Record<string, unknown>;
    return !(body.moduleId !== undefined && body.lessonId !== undefined);
  }

  defaultMessage(): string {
    return 'Choose at most one module or lesson anchor';
  }
}
