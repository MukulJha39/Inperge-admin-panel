import type { ReactNode } from 'react';
import { ActiveFilters } from './ActiveFilters';
import type { ActiveFilter } from '../utils/useCatalogList';
import { SearchInput } from './Field';

interface CatalogToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  archived: boolean;
  onArchivedChange: (value: boolean) => void;
  /** Omitted for services, which carry no stock. */
  lowStock?: { value: boolean; onChange: (value: boolean) => void };
  activeFilters: ActiveFilter[];
  onClearFilters: () => void;
  extra?: ReactNode;
}

/**
 * The filter bar shared by the catalog tables.
 *
 * Active filters stay visible and individually clearable, so a table never looks
 * mysteriously empty (PRD section 14).
 */
export function CatalogToolbar({
  search,
  onSearchChange,
  searchLabel,
  searchPlaceholder,
  archived,
  onArchivedChange,
  lowStock,
  activeFilters,
  onClearFilters,
  extra,
}: CatalogToolbarProps) {
  return (
    <>
      <div className="toolbar">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          label={searchLabel}
          placeholder={searchPlaceholder}
        />

        <div className="toolbar__filters">
          <label className="sr-only" htmlFor="filter-archived">
            Show archived
          </label>
          <select
            id="filter-archived"
            className="select"
            value={archived ? 'archived' : 'active'}
            onChange={(event) => onArchivedChange(event.target.value === 'archived')}
          >
            <option value="active">Active records</option>
            <option value="archived">Archived records</option>
          </select>

          {lowStock ? (
            <>
              <label className="sr-only" htmlFor="filter-low-stock">
                Stock level
              </label>
              <select
                id="filter-low-stock"
                className="select"
                value={lowStock.value ? 'low' : 'all'}
                onChange={(event) => lowStock.onChange(event.target.value === 'low')}
              >
                <option value="all">All stock levels</option>
                <option value="low">Needs attention</option>
              </select>
            </>
          ) : null}

          {extra}
        </div>
      </div>

      <ActiveFilters filters={activeFilters} onClearAll={onClearFilters} />
    </>
  );
}

/** Shows the available quantity. */
export function StockCell({
  quantity,
  unit,
  trackStock,
  unitLabel,
}: {
  quantity: number;
  unit: string;
  trackStock: boolean;
  unitLabel: (unit: string) => string;
}) {
  if (!trackStock) {
    return <span className="text-sm text-muted">Not tracked</span>;
  }

  return (
    <span className="text-numeric text-medium">
      {quantity} <span className="text-sm text-secondary">{unitLabel(unit)}</span>
    </span>
  );
}

export function StockStatusCell({
  isLowStock,
  isOutOfStock,
  trackStock,
}: {
  isLowStock: boolean;
  isOutOfStock: boolean;
  trackStock: boolean;
}) {
  if (!trackStock) return <span className="text-sm text-muted">Not tracked</span>;
  if (isOutOfStock) return <span className="chip chip--danger"><span className="chip__dot" aria-hidden="true" />Out of stock</span>;
  if (isLowStock) return <span className="chip chip--warning"><span className="chip__dot" aria-hidden="true" />Low stock</span>;
  return <span className="text-sm text-secondary">In stock</span>;
}
