import { Transform } from 'class-transformer';

type TrimOptions = {
  lowercase?: boolean;
};

export function Trim(options: TrimOptions = {}): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return options.lowercase ? trimmed.toLowerCase() : trimmed;
  });
}
