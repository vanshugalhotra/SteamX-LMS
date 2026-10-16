/**
 * Applies the shared password input validation and write-only Swagger schema.
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const PASSWORD_INPUT_MAX_LENGTH = 128;

type PasswordInputOptions = {
  minLength?: number;
  maxLength?: number;
};

export function PasswordInput(options: PasswordInputOptions = {}): PropertyDecorator {
  return (target, propertyKey) => {
    const maxLength = options.maxLength ?? PASSWORD_INPUT_MAX_LENGTH;
    ApiProperty({ minLength: options.minLength, maxLength, writeOnly: true })(target, propertyKey);
    IsString()(target, propertyKey);
    IsNotEmpty()(target, propertyKey);
    MaxLength(maxLength)(target, propertyKey);
  };
}
