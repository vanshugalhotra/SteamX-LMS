import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../common/pagination/pagination-response.dto.js';
import { DeliveryResponseDto } from './delivery-response.dto.js';

export class DeliveryListResponseDto extends PaginationResponseDto<DeliveryResponseDto> {
  @ApiProperty({ type: [DeliveryResponseDto] })
  items!: DeliveryResponseDto[];
}
