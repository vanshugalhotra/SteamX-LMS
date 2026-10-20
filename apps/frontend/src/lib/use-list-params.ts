import { useState } from 'react';
import { useDebouncedValue } from './use-debounced-value';

/** Search + one filter + page, with the page reset when the debounced search or filter changes. */
export function useListParams<TFilter extends string>(initialFilter: TFilter) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TFilter>(initialFilter);
  const q = useDebouncedValue(search.trim());

  const key = `${q}|${filter}`;
  const [pageState, setPageState] = useState({ key, page: 1 });
  const page = pageState.key === key ? pageState.page : 1;
  const setPage = (next: number) => {
    setPageState({ key, page: next });
  };

  return { search, setSearch, filter, setFilter, q, page, setPage };
}
