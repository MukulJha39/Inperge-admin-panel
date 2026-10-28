import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useState } from 'react';
import type { CatalogListQuery, Paginated } from '../src/api/types';
import { useCatalogList } from '../src/utils/useCatalogList';

/**
 * The hook holds the fetcher in a ref, because most callers pass an inline function and
 * depending on its identity would refetch on every render. The cost of that is that a
 * filter a page owns is invisible to the hook unless the page lists it in `deps` — which
 * is exactly the bug these tests exist to keep from coming back: a select that moved, a
 * request that never went.
 */

interface Row {
  id: string;
  name: string;
}

function page(items: Row[]): Paginated<Row> {
  return {
    items,
    meta: { page: 1, limit: 20, total: items.length, totalPages: 1, hasNextPage: false },
  };
}

/** A list with one filter of its own, folded into the fetcher the way the real pages do. */
function Harness({
  onQuery,
  declareDeps,
}: {
  onQuery: (query: CatalogListQuery & { status?: string }) => void;
  /** False reproduces the bug: the page owns a filter but never says so. */
  declareDeps: boolean;
}) {
  const [status, setStatus] = useState('');

  const fetcher = useCallback(
    async (query: CatalogListQuery) => {
      const merged = { ...query, ...(status ? { status } : {}) };
      onQuery(merged);
      return page([{ id: '1', name: 'row' }]);
    },
    [status, onQuery],
  );

  const list = useCatalogList<Row>(fetcher, {
    sort: '-createdAt',
    ...(declareDeps ? { deps: [status] } : {}),
  });

  return (
    <div>
      <label htmlFor="status">Status</label>
      <select id="status" value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="">Any</option>
        <option value="draft">Draft</option>
      </select>
      <input
        aria-label="Search"
        value={list.search}
        onChange={(event) => list.setSearch(event.target.value)}
      />
      <span data-testid="rows">{list.rows.length}</span>
    </div>
  );
}

describe('useCatalogList', () => {
  it('loads once on mount', async () => {
    const onQuery = jest.fn();
    render(<Harness onQuery={onQuery} declareDeps />);

    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));
    expect(onQuery).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20, sort: '-createdAt' }));
  });

  it('refetches with the new value when a page-owned filter changes', async () => {
    const user = userEvent.setup();
    const onQuery = jest.fn();
    render(<Harness onQuery={onQuery} declareDeps />);

    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));
    onQuery.mockClear();

    await user.selectOptions(screen.getByLabelText('Status'), 'draft');

    await waitFor(() => expect(onQuery).toHaveBeenCalled());
    expect(onQuery).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'draft' }));
  });

  it('does not refetch for a filter the page never declared', async () => {
    const user = userEvent.setup();
    const onQuery = jest.fn();
    render(<Harness onQuery={onQuery} declareDeps={false} />);

    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));
    onQuery.mockClear();

    await user.selectOptions(screen.getByLabelText('Status'), 'draft');
    // Nothing is scheduled, so a tick is enough to show nothing happened.
    await act(async () => {
      await Promise.resolve();
    });

    expect(onQuery).not.toHaveBeenCalled();
  });

  it('returns to the first page when a page-owned filter changes', async () => {
    const user = userEvent.setup();
    const onQuery = jest.fn();
    render(<Harness onQuery={onQuery} declareDeps />);

    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));
    onQuery.mockClear();

    await user.selectOptions(screen.getByLabelText('Status'), 'draft');

    await waitFor(() => expect(onQuery).toHaveBeenCalled());
    expect(onQuery).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('debounces the search box and sends the trimmed term', async () => {
    const user = userEvent.setup();
    const onQuery = jest.fn();
    render(<Harness onQuery={onQuery} declareDeps />);

    await waitFor(() => expect(onQuery).toHaveBeenCalledTimes(1));
    onQuery.mockClear();

    await user.type(screen.getByLabelText('Search'), '  chai  ');

    await waitFor(() => expect(onQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'chai' }),
    ));
  });
});
