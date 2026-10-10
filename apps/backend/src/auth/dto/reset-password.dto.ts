import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  newPassword!: string;
}
