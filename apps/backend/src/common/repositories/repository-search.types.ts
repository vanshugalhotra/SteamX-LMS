/**
 * Shared types for paginated repository searches.
 */
export type PaginationParams = {
  page: number;
  limit: number;
};

export type TextSearchParams = {
  q?: string;
};

export type RepositorySearchArguments<TWhere, TOrderBy> = {
  where: TWhere;
  orderBy: TOrderBy;
  skip: number;
  take: number;
};

export type RepositorySearch<TItem, TWhere, TOrderBy> = PaginationParams & {
  where: TWhere;
  orderBy: TOrderBy;
  findMany: (args: RepositorySearchArguments<TWhere, TOrderBy>) => Promise<TItem[]>;
  count: (where: TWhere) => Promise<number>;
};

export type RepositorySearchResult<TItem> = {
  items: TItem[];
  total: number;
};
