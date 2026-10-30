import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../common/pagination/pagination-response.dto.js';

export class DeliveryTeacherActorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class DeliveryTeacherResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  teacherId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  steamxId!: string;

  @ApiProperty({ format: 'date-time' })
  assignedAt!: Date;

  @ApiProperty({ type: DeliveryTeacherActorDto, nullable: true })
  assignedBy!: DeliveryTeacherActorDto | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  removedAt!: Date | null;

  @ApiProperty({ type: DeliveryTeacherActorDto, nullable: true })
  removedBy!: DeliveryTeacherActorDto | null;
}

export class DeliveryTeacherListResponseDto extends PaginationResponseDto<DeliveryTeacherResponseDto> {
  @ApiProperty({ type: [DeliveryTeacherResponseDto] })
  items!: DeliveryTeacherResponseDto[];
}
