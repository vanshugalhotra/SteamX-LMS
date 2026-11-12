import { ApiProperty } from '@nestjs/swagger';

export class EnrollmentCountsResponseDto {
  @ApiProperty({ minimum: 0 })
  enrolled!: number;

  @ApiProperty({ minimum: 0 })
  reactivated!: number;

  @ApiProperty({ minimum: 0 })
  alreadyEnrolled!: number;
}
