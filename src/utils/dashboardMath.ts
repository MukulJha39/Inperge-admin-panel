/**
 * The geometry and arithmetic behind the dashboard's charts.
 *
 * Deliberately free of React and of the DOM: every function here only reshapes figures
 * the API already returned, so a chart can never quietly invent a number, and the shapes
 * can be checked without rendering anything.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DayBucket {
  /** Local calendar day as YYYY-MM-DD, which is what the entries are grouped on. */
  key: string;
  /** Date label in dd/mm/yyyy format. */
  label: string;
  /** Date label in dd/mm/yyyy format for chart tooltips. */
  fullLabel: string;
  /** Money settled that day, in minor units. */
  amountMinor: number;
  count: number;
}

export interface DatedAmount {
  at: string;
  amountMinor: number;
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * One bucket per local calendar day, oldest first, with empty days kept.
 *
 * Days are stepped with the calendar rather than by adding 24 hours, so a daylight-saving
 * change cannot drop or duplicate a column.
 */
export function buildDayBuckets(
  entries: readonly DatedAmount[],
  days: number,
  now: Date = new Date(),
): DayBucket[] {
  const buckets: DayBucket[] = [];
  const index = new Map<string, DayBucket>();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const label = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    const bucket: DayBucket = {
      key: dayKey(date),
      label,
      fullLabel: label,
      amountMinor: 0,
      count: 0,
    };
    buckets.push(bucket);
    index.set(bucket.key, bucket);
  }

  for (const entry of entries) {
    const when = new Date(entry.at);
    if (Number.isNaN(when.getTime())) continue;
    const bucket = index.get(dayKey(when));
    // Anything outside the window is ignored rather than folded into an edge day.
    if (!bucket) continue;
    bucket.amountMinor += entry.amountMinor;
    bucket.count += 1;
  }

  return buckets;
}

/** The ISO instant `days` whole days before `now`, used as a query lower bound. */
export function windowStart(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - (days - 1) * DAY_MS).toISOString();
}

/* ------------------------------- line charts ------------------------------- */

export interface ChartPoint {
  x: number;
  y: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Where a value sits horizontally.
 *
 * `edge` spreads the series from one side to the other, which is what a bare trace wants.
 * `band` gives every value an equal slice and centres it in the middle, which is what a
 * daily total wants: the figure stands for a whole day rather than for an instant, and it
 * then lines up with the day's label underneath it.
 */
export type Placement = 'edge' | 'band';

/**
 * Values laid out across a box, with the baseline pinned to zero.
 *
 * Counts and money both start at zero, so a floating baseline would exaggerate small
 * differences into dramatic ones.
 */
export function plotPoints(
  values: readonly number[],
  width: number,
  height: number,
  padding = 2,
  placement: Placement = 'edge',
): ChartPoint[] {
  if (values.length === 0) return [];

  const peak = Math.max(...values, 0);
  const span = peak > 0 ? peak : 1;
  const innerHeight = Math.max(0, height - padding * 2);

  function positionOf(index: number): number {
    if (placement === 'band') return ((index + 0.5) * width) / values.length;
    if (values.length === 1) return width / 2;
    return (index * width) / (values.length - 1);
  }

  return values.map((value, index) => ({
    x: round(positionOf(index)),
    y: round(padding + innerHeight - (value / span) * innerHeight),
  }));
}

/** A gently smoothed line: control points sit midway between neighbours, so it never overshoots. */
export function smoothLinePath(points: readonly ChartPoint[]): string {
  const [first, ...rest] = points;
  if (!first) return '';

  let path = `M ${first.x} ${first.y}`;
  let previous = first;

  for (const point of rest) {
    const midX = round((previous.x + point.x) / 2);
    path += ` C ${midX} ${previous.y} ${midX} ${point.y} ${point.x} ${point.y}`;
    previous = point;
  }

  return path;
}

/** The same line closed down to a baseline, for the tinted fill underneath it. */
export function areaPath(points: readonly ChartPoint[], baselineY: number): string {
  const line = smoothLinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  if (!line || !first || !last) return '';
  return `${line} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

/* --------------------------------- donuts --------------------------------- */

export interface DonutInput {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface DonutSegment extends DonutInput {
  /** 0 to 1, of the whole donut. */
  share: number;
  /** `stroke-dasharray` for the arc, against a circle of `circumference`. */
  dashArray: string;
  /** `stroke-dashoffset` that rotates this arc into place. */
  dashOffset: number;
}

/**
 * Slices turned into dashed circle strokes.
 *
 * One `<circle>` per slice is far steadier than hand-built arc paths: no trigonometry to
 * get wrong at 0% or 100%, and `stroke-dashoffset` is cheap to animate.
 */
export function donutSegments(slices: readonly DonutInput[], circumference: number): DonutSegment[] {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  if (total <= 0) return [];

  let consumed = 0;

  return slices
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const share = slice.value / total;
      const length = round(share * circumference);
      const segment: DonutSegment = {
        ...slice,
        share,
        dashArray: `${length} ${round(circumference - length)}`,
        dashOffset: round(-consumed * circumference),
      };
      consumed += share;
      return segment;
    });
}

/* -------------------------------- formatting -------------------------------- */

/** A bounded 0–1 ratio, safe to hand to a width or a dash offset. */
export function share(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.min(1, Math.max(0, part / whole));
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/**
 * Money shortened for a headline figure. The exact amount is always kept beside it in a
 * tooltip, so nothing is lost by rounding here.
 */
export function compactMoneyMinor(minor: number | null | undefined, currency = 'INR'): string {
  if (minor === null || minor === undefined) return '—';

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(minor / 100);
  } catch {
    // An unknown currency code should not break a card.
    return `${currency} ${Math.round(minor / 100)}`;
  }
}

/** "Good morning" / "Good afternoon" / "Good evening", by the reader's own clock. */
export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
