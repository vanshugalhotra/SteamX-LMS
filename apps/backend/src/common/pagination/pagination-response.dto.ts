import { ApiProperty } from '@nestjs/swagger';

export abstract class PaginationResponseDto<T> {
  abstract items: T[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  limit!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}
