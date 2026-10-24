import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

/** Client metadata shared by initial and replacement file uploads. */
export class CreateAssetFileDto {
  @ApiProperty({ minLength: 1, maxLength: 255 })
  @Trim()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\p{Cc}/gu, '') : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename!: string;

  @ApiProperty({ example: 'image/jpeg' })
  @Trim({ lowercase: true })
  @IsString()
  mimeType!: string;

  @ApiProperty({
    minimum: 16,
    type: Number,
    description: 'At least 16 bytes are required for upload signature verification.',
  })
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
