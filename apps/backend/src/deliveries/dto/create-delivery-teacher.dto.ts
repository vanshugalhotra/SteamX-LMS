import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateDeliveryTeacherDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  teacherId!: string;
}
