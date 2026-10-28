import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  areaPath,
  donutSegments,
  formatPercent,
  plotPoints,
  share,
  smoothLinePath,
  type DonutInput,
} from '../utils/dashboardMath';
import { useEntered } from '../utils/useMotion';

/**
 * The dashboard's charts, drawn as inline SVG.
 *
 * Hand-rolled rather than pulled from a charting library: the panel ships one icon set and
 * three CSS files, and a chart dependency would be larger than the whole admin bundle for
 * the four shapes actually needed here.
 *
 * Every chart carries its numbers in text as well as in pixels — a legend, a value column
 * or a visually hidden table — so nothing on this page is readable only by colour or only
 * by length (PRD section 23).
 */

/* ------------------------------- area chart ------------------------------- */

export interface AreaPoint {
  label: string;
  fullLabel: string;
  value: number;
}

interface AreaChartProps {
  points: AreaPoint[];
  /** Renders a value for the tooltip and the hidden table. */
  formatValue: (value: number) => string;
  /** Describes the whole series for a screen reader. */
  summary: string;
  height?: number;
}

const AREA_WIDTH = 760;

export function AreaChart({ points, formatValue, summary, height = 180 }: AreaChartProps) {
  const gradientId = useId();
  const entered = useEntered();
  const [active, setActive] = useState<number | null>(null);

  const values = useMemo(() => points.map((point) => point.value), [points]);
  // Band placement: each day owns a slice of the width and sits in the middle of it, so a
  // point, its marker and its label underneath all share the same column.
  const plotted = useMemo(
    () => plotPoints(values, AREA_WIDTH, height - 24, 8, 'band'),
    [values, height],
  );

  const line = smoothLinePath(plotted);
  const fill = areaPath(plotted, height - 24);
  const peak = Math.max(...values, 0);
  const activePoint = active === null ? undefined : points[active];
  const activePlot = active === null ? undefined : plotted[active];

  /** Turns a pointer position into the column it is over, so hovering never feels fiddly. */
  function trackPointer(event: React.PointerEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0) return;
    const ratio = (event.clientX - bounds.left) / bounds.width;
    const index = Math.floor(ratio * points.length);
    setActive(Math.min(points.length - 1, Math.max(0, index)));
  }

  return (
    <div className="chart">
      <svg
        className={`chart__svg${entered ? ' chart__svg--in' : ''}`}
        viewBox={`0 0 ${AREA_WIDTH} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={summary}
        onPointerMove={trackPointer}
        onPointerLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Four guides, enough to read a level against without fencing in the data. */}
        {[0, 1, 2, 3].map((step) => {
          const y = 8 + ((height - 40) / 3) * step;
          return <line key={step} className="chart__grid" x1="0" x2={AREA_WIDTH} y1={y} y2={y} />;
        })}

        {fill ? <path className="chart__area" d={fill} fill={`url(#${gradientId})`} /> : null}
        {line ? <path className="chart__line" d={line} /> : null}

        {activePlot && activePoint ? (
          <g className="chart__marker">
            <line x1={activePlot.x} x2={activePlot.x} y1="4" y2={height - 24} />
            <circle cx={activePlot.x} cy={activePlot.y} r="5" />
          </g>
        ) : null}
      </svg>

      <div className="chart__axis" aria-hidden="true">
        {points.map((point, index) => (
          <span
            key={point.fullLabel}
            className={`chart__tick${index === active ? ' chart__tick--active' : ''}`}
          >
            {point.label}
          </span>
        ))}
      </div>

      {activePoint ? (
        <div className="chart__readout" role="status">
          <span className="chart__readout-value">{formatValue(activePoint.value)}</span>
          <span className="chart__readout-label">{activePoint.fullLabel}</span>
        </div>
      ) : (
        <div className="chart__readout chart__readout--idle">
          <span className="chart__readout-label">
            Peak {formatValue(peak)} · hover a day for its figure
          </span>
        </div>
      )}

      {/* The same series as text, for anyone not reading the picture. */}
      <table className="sr-only">
        <caption>{summary}</caption>
        <tbody>
          {points.map((point) => (
            <tr key={point.fullLabel}>
              <th scope="row">{point.fullLabel}</th>
              <td>{formatValue(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------- donut --------------------------------- */

interface DonutChartProps {
  slices: DonutInput[];
  /** The figure printed in the hole. */
  centerValue: string;
  centerLabel: string;
  size?: number;
}

const DONUT_RADIUS = 54;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

export function DonutChart({ slices, centerValue, centerLabel, size = 150 }: DonutChartProps) {
  const entered = useEntered();
  const segments = useMemo(() => donutSegments(slices, DONUT_CIRCUMFERENCE), [slices]);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div className="donut">
      <div className="donut__ring" style={{ width: size, height: size }}>
        <svg viewBox="0 0 140 140" role="img" aria-label={`${centerLabel}: ${centerValue}`}>
          <circle className="donut__track" cx="70" cy="70" r={DONUT_RADIUS} />
          <g className={`donut__segments${entered ? ' donut__segments--in' : ''}`}>
            {segments.map((segment, index) => (
              <circle
                key={segment.key}
                className="donut__segment"
                cx="70"
                cy="70"
                r={DONUT_RADIUS}
                stroke={segment.color}
                strokeDasharray={entered ? segment.dashArray : `0 ${DONUT_CIRCUMFERENCE}`}
                strokeDashoffset={segment.dashOffset}
                style={{ transitionDelay: `${index * 90}ms` }}
              />
            ))}
          </g>
        </svg>
        <div className="donut__center">
          <span className="donut__value">{centerValue}</span>
          <span className="donut__label">{centerLabel}</span>
        </div>
      </div>

      <ul className="donut__legend">
        {slices.map((slice) => (
          <li key={slice.key} className="donut__legend-item">
            <span className="donut__swatch" style={{ background: slice.color }} aria-hidden="true" />
            <span className="donut__legend-label truncate">{slice.label}</span>
            <span className="donut__legend-value text-numeric">{slice.value}</span>
            <span className="donut__legend-share text-numeric">
              {formatPercent(share(slice.value, total))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------- bar list -------------------------------- */

export interface BarRow {
  key: string;
  label: ReactNode;
  /** The bar is drawn against the largest value in the list, not against a guessed ceiling. */
  value: number;
  display: string;
  caption?: string;
  tone?: 'brand' | 'danger' | 'warning' | 'info';
}

export function BarList({ rows }: { rows: BarRow[] }) {
  const entered = useEntered();
  const peak = Math.max(...rows.map((row) => row.value), 0);

  return (
    <ul className="bars">
      {rows.map((row, index) => (
        <li
          key={row.key}
          className={`bars__row bars__row--${row.tone ?? 'brand'}`}
          style={{ '--i': index } as React.CSSProperties}
        >
          <div className="bars__head">
            <span className="bars__label truncate">{row.label}</span>
            <span className="bars__value text-numeric" title={row.caption ?? undefined}>
              {row.display}
            </span>
          </div>
          <div className="bars__track">
            <span
              className="bars__fill"
              style={{
                width: entered ? `${Math.max(2, share(row.value, peak) * 100)}%` : '0%',
                transitionDelay: `${index * 70}ms`,
              }}
            />
          </div>
          {row.caption ? <span className="bars__caption">{row.caption}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------- sparkline ------------------------------- */

/** The small trace inside a stat card: shape only, with the figure stated beside it. */
export function Sparkline({ values, width = 92, height = 30 }: { values: number[]; width?: number; height?: number }) {
  const entered = useEntered();
  const points = useMemo(() => plotPoints(values, width, height, 3), [values, width, height]);
  const line = smoothLinePath(points);
  if (!line) return null;

  return (
    <svg
      className={`spark${entered ? ' spark--in' : ''}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
    >
      <path className="spark__line" d={line} />
    </svg>
  );
}
