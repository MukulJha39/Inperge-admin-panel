import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon } from './Icon';
import { Skeleton } from './States';
import { Sparkline } from './Charts';
import { useCountUp } from '../utils/useMotion';

export type StatTone = 'brand' | 'info' | 'success' | 'warning' | 'danger';

interface StatCardProps {
  label: string;
  /** The real figure. The card counts up to it; it never rounds it away. */
  value: number;
  /** How the counting figure is written out, for example as compact money. */
  format?: (value: number) => string;
  /** The exact figure, shown on hover, when the headline is abbreviated. */
  exact?: string;
  caption?: ReactNode;
  icon: ReactNode;
  tone?: StatTone;
  /** Where the card leads, when the figure has a screen behind it. */
  to?: string;
  linkLabel?: string;
  series?: number[];
  loading?: boolean;
  /** Position in the row, which staggers the entrance. */
  index?: number;
}

const defaultFormat = (value: number) => Math.round(value).toLocaleString();

/**
 * One headline figure.
 *
 * The number eases up from zero on arrival, which reads as the figure landing rather than
 * the page flickering; under `prefers-reduced-motion` it is simply there.
 */
export function StatCard({
  label,
  value,
  format = defaultFormat,
  exact,
  caption,
  icon,
  tone = 'brand',
  to,
  linkLabel,
  series,
  loading = false,
  index = 0,
}: StatCardProps) {
  const animated = useCountUp(loading ? 0 : value);

  const body = (
    <>
      <div className="stat__top">
        <span className={`stat__icon stat__icon--${tone}`} aria-hidden="true">
          {icon}
        </span>
        {series && series.length > 1 && !loading ? <Sparkline values={series} /> : null}
      </div>

      <div className="stat__value" title={exact ?? undefined}>
        {loading ? <Skeleton width="60%" height="26px" /> : format(animated)}
      </div>

      <div className="stat__label">{label}</div>

      {loading ? (
        <Skeleton width="80%" height="11px" />
      ) : caption ? (
        <div className="stat__caption">{caption}</div>
      ) : null}

      {to && !loading ? (
        <span className="stat__link">
          {linkLabel ?? 'Open'}
          <ArrowRightIcon size={13} />
        </span>
      ) : null}
    </>
  );

  const style = { '--i': index } as CSSProperties;

  if (to && !loading) {
    return (
      <Link to={to} className={`stat stat--${tone} stat--link dash-rise`} style={style}>
        {body}
      </Link>
    );
  }

  return (
    <div className={`stat stat--${tone} dash-rise`} style={style}>
      {body}
    </div>
  );
}
