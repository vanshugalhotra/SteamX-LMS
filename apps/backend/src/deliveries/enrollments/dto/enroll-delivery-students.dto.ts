import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class EnrollDeliveryStudentsDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: 200,
    uniqueItems: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  studentIds!: string[];
}
