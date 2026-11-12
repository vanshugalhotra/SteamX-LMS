import { ApiProperty } from '@nestjs/swagger';
import { EnrollmentStatus } from '../../../generated/prisma/client.js';
import { PaginationResponseDto } from '../../../common/pagination/pagination-response.dto.js';

export class DeliveryEnrollmentActorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class DeliveryEnrollmentClassSectionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  className!: string;

  @ApiProperty()
  sectionName!: string;
}

export class DeliveryEnrollmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  studentId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  steamxId!: string;

  @ApiProperty({ type: DeliveryEnrollmentClassSectionDto })
  classSection!: DeliveryEnrollmentClassSectionDto;

  @ApiProperty({ enum: EnrollmentStatus })
  status!: EnrollmentStatus;

  @ApiProperty({ format: 'date-time' })
  enrolledAt!: Date;

  @ApiProperty({ type: DeliveryEnrollmentActorDto, nullable: true })
  enrolledBy!: DeliveryEnrollmentActorDto | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  endedAt!: Date | null;

  @ApiProperty({ type: DeliveryEnrollmentActorDto, nullable: true })
  endedBy!: DeliveryEnrollmentActorDto | null;
}

export class DeliveryEnrollmentListResponseDto extends PaginationResponseDto<DeliveryEnrollmentResponseDto> {
  @ApiProperty({ type: [DeliveryEnrollmentResponseDto] })
  items!: DeliveryEnrollmentResponseDto[];
}
