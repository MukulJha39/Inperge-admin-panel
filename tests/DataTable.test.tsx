import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DataTable, type Column } from '../src/components/DataTable';

/**
 * The table reads the router so a row can lead somewhere, and its cells routinely render
 * links, so it is always mounted inside one in the app. The tests do the same.
 */
function render(ui: ReactElement) {
  const result = rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
  return {
    ...result,
    // Re-wrap on rerender too, or the second render loses the router.
    rerender: (next: ReactElement) => result.rerender(<MemoryRouter>{next}</MemoryRouter>),
  };
}

interface Row {
  id: string;
  name: string;
  phone: string;
}

const ROWS: Row[] = [
  { id: '1', name: 'Anita Desai', phone: '+91 9876500001' },
  { id: '2', name: 'Rahul Verma', phone: '+91 9876500002' },
];

const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Merchant', sortable: true, render: (row) => row.name },
  { key: 'phone', header: 'Verified phone', render: (row) => row.phone },
];

const EMPTY = { title: 'No merchants yet', message: 'Merchants appear here once they register in the app.' };

describe('DataTable', () => {
  it('renders rows and column headers', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(row) => row.id} empty={EMPTY} />);

    expect(screen.getByRole('columnheader', { name: /Merchant/ })).toBeInTheDocument();
    expect(screen.getByText('Anita Desai')).toBeInTheDocument();
    expect(screen.getByText('+91 9876500002')).toBeInTheDocument();
  });

  it('sorts ascending on first click and reverses on the second', async () => {
    const user = userEvent.setup();
    const onSortChange = jest.fn();

    const { rerender } = render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        empty={EMPTY}
        sort="-createdAt"
        onSortChange={onSortChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Merchant/ }));
    expect(onSortChange).toHaveBeenLastCalledWith('name');

    rerender(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        empty={EMPTY}
        sort="name"
        onSortChange={onSortChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Merchant/ }));
    expect(onSortChange).toHaveBeenLastCalledWith('-name');
  });

  it('exposes the active sort direction to assistive technology', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        empty={EMPTY}
        sort="-name"
        onSortChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /Merchant/ })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: 'Verified phone' })).not.toHaveAttribute('aria-sort');
  });

  it('does not offer sorting for columns that are not sortable', () => {
    render(
      <DataTable columns={COLUMNS} rows={ROWS} rowKey={(row) => row.id} empty={EMPTY} onSortChange={jest.fn()} />,
    );

    expect(screen.queryByRole('button', { name: 'Verified phone' })).not.toBeInTheDocument();
  });

  it('explains an empty list and offers the next action', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();

    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        rowKey={(row) => row.id}
        empty={{ ...EMPTY, action: { label: 'Clear filters', onClick } }}
      />,
    );

    expect(screen.getByText('No merchants yet')).toBeInTheDocument();
    expect(screen.getByText(/Merchants appear here/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('shows a skeleton while loading instead of an empty state', () => {
    const { container } = render(
      <DataTable columns={COLUMNS} rows={[]} rowKey={(row) => row.id} empty={EMPTY} loading />,
    );

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('No merchants yet')).not.toBeInTheDocument();
  });

  it('shows a recoverable error state', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();

    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        rowKey={(row) => row.id}
        empty={EMPTY}
        error="Could not load merchants. Please try again."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Could not load merchants. Please try again.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('renders row actions when supplied', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        empty={EMPTY}
        rowActions={(row) => <button type="button">Edit {row.name}</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Edit Anita Desai' })).toBeInTheDocument();
  });

  /*
   * A clickable row is a pointer convenience over a real link. These cover the three
   * things it must not steal: a click meant for a control, a click that ends a text
   * selection, and a modified click asking for a new tab.
   */
  describe('clickable rows', () => {
    function renderClickable(extra: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
      return rtlRender(
        <MemoryRouter initialEntries={['/merchants']}>
          <Routes>
            <Route
              path="/merchants"
              element={
                <DataTable
                  columns={COLUMNS}
                  rows={ROWS}
                  rowKey={(row) => row.id}
                  empty={EMPTY}
                  rowHref={(row) => `/merchants/${row.id}`}
                  {...extra}
                />
              }
            />
            <Route path="/merchants/:id" element={<h1>Merchant detail</h1>} />
          </Routes>
        </MemoryRouter>,
      );
    }

    it('marks a row that leads somewhere, and leaves the others alone', () => {
      renderClickable();
      const row = screen.getByText('Anita Desai').closest('tr');
      expect(row).toHaveClass('table__row--clickable');

      rtlRender(
        <MemoryRouter>
          <DataTable columns={COLUMNS} rows={ROWS} rowKey={(row) => row.id} empty={EMPTY} />
        </MemoryRouter>,
      );
      expect(screen.getAllByText('Rahul Verma')[1]?.closest('tr')).not.toHaveClass(
        'table__row--clickable',
      );
    });

    it('opens the row when a plain cell is clicked', async () => {
      const user = userEvent.setup();
      renderClickable();

      await user.click(screen.getByText('+91 9876500001'));

      expect(await screen.findByRole('heading', { name: 'Merchant detail' })).toBeInTheDocument();
    });

    it('leaves a click on a row action to that action', async () => {
      const user = userEvent.setup();
      const onAction = jest.fn();
      renderClickable({
        rowActions: (row: Row) => (
          <button type="button" onClick={onAction}>
            {`Edit ${row.name}`}
          </button>
        ),
      });

      await user.click(screen.getByRole('button', { name: 'Edit Anita Desai' }));

      expect(onAction).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('heading', { name: 'Merchant detail' })).not.toBeInTheDocument();
    });

    it('stays put when the click only ended a text selection', async () => {
      const user = userEvent.setup();
      // jsdom's Selection does not stringify a range, so the selected text is stated
      // directly: what is under test is the guard, not the browser's selection model.
      const getSelection = jest
        .spyOn(window, 'getSelection')
        .mockReturnValue({ toString: () => '+91 9876500001' } as unknown as Selection);

      renderClickable();
      await user.click(screen.getByText('+91 9876500001'));

      expect(screen.queryByRole('heading', { name: 'Merchant detail' })).not.toBeInTheDocument();

      // With nothing selected, the same click does navigate.
      getSelection.mockReturnValue({ toString: () => '' } as unknown as Selection);
      await user.click(screen.getByText('+91 9876500001'));
      expect(await screen.findByRole('heading', { name: 'Merchant detail' })).toBeInTheDocument();

      getSelection.mockRestore();
    });

    it('opens a new tab for a modified click rather than navigating', async () => {
      const user = userEvent.setup();
      const open = jest.spyOn(window, 'open').mockImplementation(() => null);
      renderClickable();

      await user.keyboard('{Meta>}');
      await user.click(screen.getByText('+91 9876500001'));
      await user.keyboard('{/Meta}');

      expect(open).toHaveBeenCalledWith('/merchants/1', '_blank', 'noopener,noreferrer');
      expect(screen.queryByRole('heading', { name: 'Merchant detail' })).not.toBeInTheDocument();
      open.mockRestore();
    });
  });
});
