import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../common/pagination/pagination-response.dto.js';
import { SubscriptionResponseDto } from './subscription-response.dto.js';

export class SubscriptionListResponseDto extends PaginationResponseDto<SubscriptionResponseDto> {
  @ApiProperty({ type: [SubscriptionResponseDto] })
  items!: SubscriptionResponseDto[];
}
