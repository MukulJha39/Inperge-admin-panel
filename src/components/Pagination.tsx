import type { PageMeta } from '../api/types';
import { Button } from './Button';
import { ChevronLeftIcon, ChevronRightIcon } from './Icon';

interface PaginationProps {
  meta: PageMeta;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  /** Noun for the records being listed, for example "merchants". */
  noun?: string;
}

const LIMIT_OPTIONS = [10, 20, 50, 100];

export function Pagination({ meta, onPageChange, onLimitChange, noun = 'records' }: PaginationProps) {
  if (meta.total === 0) return null;

  const firstOnPage = (meta.page - 1) * meta.limit + 1;
  const lastOnPage = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="pagination">
      <div className="pagination__info">
        Showing <span className="text-numeric text-medium">{firstOnPage}</span>–
        <span className="text-numeric text-medium">{lastOnPage}</span> of{' '}
        <span className="text-numeric text-medium">{meta.total}</span> {noun}
      </div>

      <div className="pagination__controls">
        {onLimitChange ? (
          <>
            <label className="sr-only" htmlFor="page-size">
              Records per page
            </label>
            <select
              id="page-size"
              className="select"
              style={{ width: 'auto', minHeight: 32 }}
              value={meta.limit}
              onChange={(event) => onLimitChange(Number(event.target.value))}
            >
              {LIMIT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} per page
                </option>
              ))}
            </select>
          </>
        ) : null}

        <Button
          size="sm"
          icon={<ChevronLeftIcon size={14} />}
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          Previous
        </Button>

        <span className="pagination__info text-numeric">
          Page {meta.page} of {Math.max(meta.totalPages, 1)}
        </span>

        <Button size="sm" disabled={!meta.hasNextPage} onClick={() => onPageChange(meta.page + 1)}>
          Next <ChevronRightIcon size={14} />
        </Button>
      </div>
    </div>
  );
}
