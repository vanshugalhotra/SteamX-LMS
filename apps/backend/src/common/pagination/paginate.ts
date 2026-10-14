import type { PaginationResponseDto } from './pagination-response.dto.js';

export function paginate<T>(
  items: T[],
  page: number,
  limit: number,
  total: number,
): PaginationResponseDto<T> {
  return { items, page, limit, total };
}
