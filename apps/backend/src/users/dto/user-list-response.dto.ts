import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../common/pagination/pagination-response.dto.js';
import { UserListItemResponseDto } from './user-list-item-response.dto.js';

export class UserListResponseDto extends PaginationResponseDto<UserListItemResponseDto> {
  @ApiProperty({ type: [UserListItemResponseDto] })
  override items!: UserListItemResponseDto[];
}
