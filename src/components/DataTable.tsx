import type { MouseEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { SortAscIcon, SortDescIcon, SortIcon } from './Icon';
import { EmptyState, ErrorState, TableSkeleton } from './States';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  numeric?: boolean;
  width?: string;
  /**
   * The column carrying the longest text, which is allowed to wrap.
   *
   * Columns are laid out at equal widths, so every heading sits the same distance from its
   * neighbours whatever the data does. The one named here is the record being listed, and
   * it is the only column permitted a second line rather than being cut short. One per
   * table.
   */
  grow?: boolean;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty: { title: string; message: string; action?: { label: string; onClick: () => void } };
  /** API sort string, for example `-createdAt`. */
  sort?: string;
  onSortChange?: (sort: string) => void;
  rowActions?: (row: T) => ReactNode;
  /**
   * Where a row leads, making the whole row a click target for it.
   *
   * A pointer convenience layered over a real link, never a replacement for one: the row
   * itself is not focusable and takes no keyboard handler, because a `<tr>` given a button
   * role stops being a row to a screen reader. The table must still carry a genuine link
   * in one of its cells — that is what keyboard and assistive-technology users follow, and
   * what a reader middle-clicks to open in a tab.
   */
  rowHref?: (row: T) => string;
  caption?: string;
}

function parseSort(sort: string | undefined): { field: string; descending: boolean } {
  if (!sort) return { field: '', descending: false };
  return sort.startsWith('-') ? { field: sort.slice(1), descending: true } : { field: sort, descending: false };
}

/**
 * The one table in the panel: sortable headers, skeleton loading, an explanatory empty
 * state and a recoverable error state (PRD section 25).
 *
 * Search, filters and pagination are supplied by the page around it, because they
 * belong to the query the page owns.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  onRetry,
  empty,
  sort,
  onSortChange,
  rowActions,
  rowHref,
  caption,
}: DataTableProps<T>) {
  const navigate = useNavigate();
  const active = parseSort(sort);
  const columnCount = columns.length + (rowActions ? 1 : 0);

  function toggleSort(field: string) {
    if (!onSortChange) return;
    // First click sorts ascending; clicking the active column reverses it.
    onSortChange(active.field === field && !active.descending ? `-${field}` : field);
  }

  /**
   * Opens the row's destination, unless the click was really meant for something else.
   *
   * Three things a row click must not steal: a click on a control inside the row, which
   * belongs to that control; a click that ends a text selection, because someone copying a
   * phone number should keep the page they are on; and a modified click, which means
   * "somewhere else" and is honoured by opening a tab rather than navigating away.
   */
  function openRow(event: MouseEvent<HTMLTableRowElement>, row: T) {
    if (!rowHref) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest('a, button, input, select, textarea, label, [role="button"]')) return;

    if ((window.getSelection()?.toString() ?? '') !== '') return;

    const href = rowHref(row);
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }

    navigate(href);
  }

  if (error) {
    return <ErrorState message={error} {...(onRetry ? { onRetry } : {})} />;
  }

  if (!loading && rows.length === 0) {
    return (
      <EmptyState
        title={empty.title}
        message={empty.message}
        {...(empty.action ? { action: empty.action } : {})}
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="table" style={{ minWidth: `${columnCount * 9}rem` }}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => {
              const isActive = active.field === column.key;
              const ariaSort = isActive ? (active.descending ? 'descending' : 'ascending') : undefined;

              return (
                <th
                  key={column.key}
                  scope="col"
                  // A numeric header follows its column: right-aligned, so the label sits
                  // over the digits rather than away from them.
                  className={
                    [column.numeric ? 'table__cell--numeric' : '', column.grow ? 'table__cell--grow' : '']
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  aria-sort={column.sortable ? ariaSort ?? 'none' : undefined}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      className={`table__sort${isActive ? ' table__sort--active' : ''}`}
                      onClick={() => toggleSort(column.key)}
                    >
                      {column.header}
                      <span className="table__sort-icon">
                        {isActive ? (
                          active.descending ? (
                            <SortDescIcon />
                          ) : (
                            <SortAscIcon />
                          )
                        ) : (
                          <SortIcon />
                        )}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
            {rowActions ? (
              <th scope="col" className="table__cell--actions" style={{ textAlign: 'right' }}>
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>

        {loading ? (
          <TableSkeleton columns={columnCount} />
        ) : (
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={rowHref ? 'table__row--clickable' : undefined}
                onClick={rowHref ? (event) => openRow(event, row) : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={
                      [column.numeric ? 'table__cell--numeric' : '', column.grow ? 'table__cell--grow' : '']
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                  >
                    {column.render(row)}
                  </td>
                ))}
                {rowActions ? (
                  <td>
                    <div className="table__actions">{rowActions(row)}</div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}
