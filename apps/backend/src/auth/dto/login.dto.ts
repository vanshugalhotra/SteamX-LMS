import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  steamxId!: string;

  @ApiProperty({ maxLength: 128, writeOnly: true })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
