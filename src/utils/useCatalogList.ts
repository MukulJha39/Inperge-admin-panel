import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import type { CatalogListQuery, PageMeta, Paginated } from '../api/types';
import { useDebounce } from './useDebounce';

export type CatalogFetcher<T> = (
  query: CatalogListQuery,
  signal: AbortSignal,
) => Promise<Paginated<T>>;

export interface ActiveFilter {
  label: string;
  clear: () => void;
}

export interface CatalogListState<T> {
  rows: T[];
  meta: PageMeta;
  loading: boolean;
  error: string | null;

  search: string;
  setSearch: (value: string) => void;
  archived: boolean;
  setArchived: (value: boolean) => void;
  lowStock: boolean;
  setLowStock: (value: boolean) => void;
  /** Narrows a customer, supplier or purchase list to the rows that owe money. */
  outstanding: boolean;
  setOutstanding: (value: boolean) => void;
  merchantId: string;
  setMerchantId: (value: string) => void;
  sort: string;
  setSort: (value: string) => void;
  page: number;
  setPage: (value: number) => void;
  limit: number;
  setLimit: (value: number) => void;

  activeFilters: ActiveFilter[];
  clearFilters: () => void;
  reload: () => void;
  /** Replaces one row in place after a successful edit, without refetching the page. */
  applyRow: (updated: T) => void;
}

const EMPTY_META: PageMeta = { page: 1, limit: 20, total: 0, totalPages: 0, hasNextPage: false };

/**
 * Whether a row carries its own identity.
 *
 * Most lists are of records with an `id`, and those can be patched in place after an edit.
 * A few are aggregations — receivables rolled up per merchant, instalments unwound out of
 * their orders — which have no record of their own to patch, and reload instead.
 */
function hasId(row: unknown): row is { id: string } {
  return (
    typeof row === 'object' && row !== null && typeof (row as { id?: unknown }).id === 'string'
  );
}

/**
 * The shared behaviour of every catalog table: debounced search, filters, sorting,
 * pagination, cancellation on unmount, and in-place row updates.
 *
 * Extracted because four tables need exactly this, and a copy in each would drift.
 */
export function useCatalogList<T>(
  fetcher: CatalogFetcher<T>,
  options: {
    sort?: string;
    merchantId?: string;
    lowStock?: boolean;
    outstanding?: boolean;
    /** How to identify a row that does not carry an `id` of its own. */
    rowId?: (row: T) => string;
    /**
     * The page's own filter values, where it has any.
     *
     * A page that owns filters beyond the shared set folds them into its `fetcher`. The
     * fetcher itself is held in a ref — most callers pass an inline function, and depending
     * on its identity would refetch on every render — so changing one of those values is
     * invisible to the effect below unless the page says what they are. Listing them here
     * is what makes a page-owned filter actually reach the server.
     */
    deps?: readonly unknown[];
  } = {},
): CatalogListState<T> {
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [lowStock, setLowStock] = useState(options.lowStock ?? false);
  const [outstanding, setOutstanding] = useState(options.outstanding ?? false);
  const [merchantId, setMerchantId] = useState(options.merchantId ?? '');
  const [sort, setSort] = useState(options.sort ?? '-updatedAt');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [rows, setRows] = useState<T[]>([]);
  const [meta, setMeta] = useState<PageMeta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Kept in refs so a page can pass inline callbacks without causing a refetch loop.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const rowIdRef = useRef(options.rowId);
  rowIdRef.current = options.rowId;

  const debouncedSearch = useDebounce(search);

  /*
   * The page's filters reduced to one primitive.
   *
   * Serialised rather than spread into the dependency arrays so the effects keep a fixed
   * number of dependencies, which is what the exhaustive-deps rule can actually check.
   * These values are the filter state of a form — strings, numbers and booleans — so a
   * round trip through JSON compares them by value, which is the comparison wanted here.
   */
  const filterKey = JSON.stringify(options.deps ?? []);

  // Any change to the query itself returns to the first page.
  useEffect(
    () => setPage(1),
    [debouncedSearch, archived, lowStock, outstanding, merchantId, sort, limit, filterKey],
  );

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetcherRef.current(
          {
            search: debouncedSearch.trim() || undefined,
            archived,
            lowStock: lowStock || undefined,
            outstanding: outstanding || undefined,
            merchantId: merchantId || undefined,
            sort,
            page,
            limit,
          },
          controller.signal,
        );
        if (cancelled) return;
        setRows(result.items);
        setMeta(result.meta);
      } catch (requestError) {
        if (cancelled || (requestError instanceof DOMException && requestError.name === 'AbortError')) {
          return;
        }
        setRows([]);
        setMeta(EMPTY_META);
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : 'Could not load this list. Please try again.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    debouncedSearch,
    archived,
    lowStock,
    outstanding,
    merchantId,
    sort,
    page,
    limit,
    reloadToken,
    filterKey,
  ]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const applyRow = useCallback((updated: T) => {
    const identify = (row: T): string | null => {
      if (rowIdRef.current) return rowIdRef.current(row);
      return hasId(row) ? row.id : null;
    };

    const key = identify(updated);
    // Nothing to match on, so there is nothing to patch: such a list reloads instead.
    if (key === null) return;

    setRows((current) => current.map((row) => (identify(row) === key ? updated : row)));
  }, []);

  const clearFilters = useCallback(() => {
    setSearch('');
    setArchived(false);
    setLowStock(false);
    setOutstanding(false);
  }, []);

  const activeFilters = useMemo(() => {
    const filters: ActiveFilter[] = [];
    if (debouncedSearch.trim()) {
      filters.push({ label: `Search: ${debouncedSearch.trim()}`, clear: () => setSearch('') });
    }
    if (archived) filters.push({ label: 'Archived only', clear: () => setArchived(false) });
    if (lowStock) filters.push({ label: 'Low stock only', clear: () => setLowStock(false) });
    if (outstanding) {
      filters.push({ label: 'Owes money only', clear: () => setOutstanding(false) });
    }
    return filters;
  }, [debouncedSearch, archived, lowStock, outstanding]);

  return {
    rows,
    meta,
    loading,
    error,
    search,
    setSearch,
    archived,
    setArchived,
    lowStock,
    setLowStock,
    outstanding,
    setOutstanding,
    merchantId,
    setMerchantId,
    sort,
    setSort,
    page,
    setPage,
    limit,
    setLimit,
    activeFilters,
    clearFilters,
    reload,
    applyRow,
  };
}
