import { CloseIcon } from './Icon';

export interface ActiveFilter {
  /** What is being filtered, written so it reads on its own: "Status: Draft". */
  label: string;
  clear: () => void;
}

interface ActiveFiltersProps {
  filters: ActiveFilter[];
  onClearAll: () => void;
}

/**
 * The filters currently narrowing a list, each one removable.
 *
 * One component for every list in the panel. There were four copies of this before, in two
 * different shapes, and three of the classes they reached for had never been written — so
 * half the pages rendered the row as bare browser buttons. A filter an administrator cannot
 * see is one they forget is on, and then the list looks wrong rather than filtered
 * (PRD section 14).
 */
export function ActiveFilters({ filters, onClearAll }: ActiveFiltersProps) {
  if (filters.length === 0) return null;

  return (
    <div className="active-filters">
      <span className="active-filters__label">Filtered by</span>

      <ul className="active-filters__list">
        {filters.map((filter) => (
          <li key={filter.label}>
            <span className="filter-pill">
              {filter.label}
              <button
                type="button"
                className="filter-pill__remove"
                onClick={filter.clear}
                aria-label={`Remove filter: ${filter.label}`}
              >
                <CloseIcon size={11} />
              </button>
            </span>
          </li>
        ))}
      </ul>

      <button type="button" className="btn btn--ghost btn--sm" onClick={onClearAll}>
        Clear all
      </button>
    </div>
  );
}
