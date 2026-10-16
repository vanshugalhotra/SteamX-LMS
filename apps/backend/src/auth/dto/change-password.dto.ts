import { PasswordInput } from '../../common/decorators/password-input.decorator.js';
import { MAX_PASSWORD_CHARACTERS, MIN_PASSWORD_CHARACTERS } from '../validators/password-policy.js';

export class ChangePasswordDto {
  @PasswordInput({
    minLength: MIN_PASSWORD_CHARACTERS,
    maxLength: MAX_PASSWORD_CHARACTERS,
  })
  currentPassword!: string;

  @PasswordInput()
  newPassword!: string;
}
