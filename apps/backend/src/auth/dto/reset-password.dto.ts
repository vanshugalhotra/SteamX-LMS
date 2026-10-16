import { PasswordInput } from '../../common/decorators/password-input.decorator.js';
import {
  MAX_PASSWORD_CHARACTERS,
  MIN_PASSWORD_CHARACTERS,
} from '../../common/validators/password-policy.js';

export class ResetPasswordDto {
  @PasswordInput({
    minLength: MIN_PASSWORD_CHARACTERS,
    maxLength: MAX_PASSWORD_CHARACTERS,
  })
  newPassword!: string;
}
