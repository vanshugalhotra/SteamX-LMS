/**
 * Runs a paginated find + count query in parallel.
 */
export async function paginatedSearch<TItem, TWhere, TOrderBy>(args: {
  where: TWhere;
  orderBy: TOrderBy;
  page: number;
  limit: number;
  findMany: (query: {
    where: TWhere;
    orderBy: TOrderBy;
    skip: number;
    take: number;
  }) => Promise<TItem[]>;
  count: (where: TWhere) => Promise<number>;
}): Promise<{ items: TItem[]; total: number }> {
  const [items, total] = await Promise.all([
    args.findMany({
      where: args.where,
      orderBy: args.orderBy,
      skip: (args.page - 1) * args.limit,
      take: args.limit,
    }),
    args.count(args.where),
  ]);
  return { items, total };
}
