import { useState } from 'react';
import { useDebouncedValue } from './use-debounced-value';

/** Search + one filter + page, with the page reset when the debounced search or filter changes. */
export function useListParams<TFilter extends string>(initialFilter: TFilter) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TFilter>(initialFilter);
  /** Optional second filter (e.g. a school id). Empty string means "all". */
  const [secondary, setSecondary] = useState('');
  const q = useDebouncedValue(search.trim());

  const key = `${q}|${filter}|${secondary}`;
  const [pageState, setPageState] = useState({ key, page: 1 });
  const page = pageState.key === key ? pageState.page : 1;
  const setPage = (next: number) => {
    setPageState({ key, page: next });
  };

  return { search, setSearch, filter, setFilter, secondary, setSecondary, q, page, setPage };
}
