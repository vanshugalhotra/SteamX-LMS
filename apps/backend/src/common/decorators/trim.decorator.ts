/**
 * Trims DTO strings; lowercase can be enabled for normalized fields like email.
 * Non-string values pass through so class-validator can report their actual type.
 */
import { Transform } from 'class-transformer';

type TrimOptions = {
  lowercase?: boolean;
  uppercase?: boolean;
};

export function Trim(options: TrimOptions = {}): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    if (options.lowercase) {
      return trimmed.toLowerCase();
    }
    return options.uppercase ? trimmed.toUpperCase() : trimmed;
  });
}
