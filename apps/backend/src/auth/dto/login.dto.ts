import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PasswordInput } from '../../common/decorators/password-input.decorator.js';

export class LoginDto {
  @ApiProperty({ maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  steamxId!: string;

  @PasswordInput()
  password!: string;
}
