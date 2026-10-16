/**
 * Documents the standard error envelope returned by the global exception filter.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorDetailDto {
  @ApiProperty()
  field!: string;

  @ApiProperty({ type: [String] })
  errors!: string[];
}

export class ApiErrorResponseDto {
  @ApiProperty()
  statusCode!: number;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional({ type: [ApiErrorDetailDto] })
  details?: ApiErrorDetailDto[];

  @ApiProperty({ format: 'uuid' })
  requestId!: string;
}
