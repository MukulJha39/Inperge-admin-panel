import type { ReactNode } from 'react';
import { AlertIcon, InboxIcon } from './Icon';
import { Button } from './Button';

interface SkeletonProps {
  width?: string;
  height?: string;
  radius?: string;
}

export function Skeleton({ width = '100%', height = '14px', radius }: SkeletonProps) {
  return (
    <span
      className="skeleton"
      aria-hidden="true"
      style={{ display: 'block', width, height, ...(radius ? { borderRadius: radius } : {}) }}
    />
  );
}

/**
 * Placeholder for a detail panel while its record loads.
 *
 * Separate from `TableSkeleton`, which renders a bare `<tbody>` and is only valid inside a
 * `<table>`: a drawer has no table to put it in, and a `<tbody>` loose in a `<div>` is
 * invalid markup the browser silently drops.
 */
export function DetailSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="stack gap-4" aria-hidden="true">
      <Skeleton width="45%" height="16px" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} width={index % 2 === 0 ? '80%' : '60%'} height="12px" />
      ))}
    </div>
  );
}

/** Table placeholder that keeps the row rhythm while data loads (PRD section 22). */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex}>
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <td key={columnIndex}>
              <Skeleton width={columnIndex === 0 ? '70%' : '45%'} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

interface EmptyStateProps {
  title: string;
  /** Says why the section matters and what to do next (PRD section 22). */
  message: string;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, message, icon, action }: EmptyStateProps) {
  return (
    <div className="state">
      <span className="state__icon">{icon ?? <InboxIcon />}</span>
      <h3 className="state__title">{title}</h3>
      <p className="state__message">{message}</p>
      {action ? (
        <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

/** Plain language, a way forward, and no internal detail (PRD section 22). */
export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div className="state">
      <span className="state__icon state__icon--danger">
        <AlertIcon size={20} />
      </span>
      <h3 className="state__title">{title}</h3>
      <p className="state__message">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function InlineAlert({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'warning';
  children: ReactNode;
}) {
  return (
    <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <span aria-hidden="true">
        <AlertIcon size={15} />
      </span>
      <div>{children}</div>
    </div>
  );
}

export function FullPageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="state" style={{ minHeight: '60vh' }}>
      <Skeleton width="180px" height="20px" />
      <Skeleton width="280px" height="14px" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
