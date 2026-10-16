/**
 * Shares the repeated page-offset and total-count query pattern across repositories.
 */
import type { RepositorySearch, RepositorySearchResult } from './repository-search.types.js';

export abstract class BaseRepository {
  protected async search<TItem, TWhere, TOrderBy>(
    query: RepositorySearch<TItem, TWhere, TOrderBy>,
  ): Promise<RepositorySearchResult<TItem>> {
    const [items, total] = await Promise.all([
      query.findMany({
        where: query.where,
        orderBy: query.orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      query.count(query.where),
    ]);
    return { items, total };
  }
}
