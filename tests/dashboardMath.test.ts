import {
  areaPath,
  buildDayBuckets,
  compactMoneyMinor,
  donutSegments,
  greeting,
  plotPoints,
  share,
  smoothLinePath,
  windowStart,
} from '../src/utils/dashboardMath';

describe('buildDayBuckets', () => {
  const now = new Date(2026, 9, 6, 14, 30); // 6 October 2026, local time

  it('keeps one bucket per day, oldest first, including empty days', () => {
    const buckets = buildDayBuckets([], 5, now);
    expect(buckets).toHaveLength(5);
    expect(buckets.map((bucket) => bucket.key)).toEqual([
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
    ]);
    expect(buckets.every((bucket) => bucket.amountMinor === 0 && bucket.count === 0)).toBe(true);
    expect(buckets[4]).toMatchObject({
      label: '06/10/2026',
      fullLabel: '06/10/2026',
    });
  });

  it('sums entries into the local day they fall on', () => {
    const buckets = buildDayBuckets(
      [
        { at: new Date(2026, 9, 6, 9, 0).toISOString(), amountMinor: 1500 },
        { at: new Date(2026, 9, 6, 11, 0).toISOString(), amountMinor: 2500 },
        { at: new Date(2026, 9, 4, 18, 0).toISOString(), amountMinor: 700 },
      ],
      5,
      now,
    );

    const byKey = Object.fromEntries(buckets.map((bucket) => [bucket.key, bucket]));
    expect(byKey['2026-10-06']).toMatchObject({ amountMinor: 4000, count: 2 });
    expect(byKey['2026-10-04']).toMatchObject({ amountMinor: 700, count: 1 });
  });

  it('ignores entries outside the window rather than folding them into an edge day', () => {
    const buckets = buildDayBuckets(
      [
        { at: new Date(2026, 8, 20, 9, 0).toISOString(), amountMinor: 9999 },
        { at: 'not a date', amountMinor: 1234 },
      ],
      5,
      now,
    );

    expect(buckets.reduce((sum, bucket) => sum + bucket.amountMinor, 0)).toBe(0);
  });

  it('steps days by the calendar, so a month boundary does not shift the keys', () => {
    const buckets = buildDayBuckets([], 3, new Date(2026, 10, 1, 10, 0));
    expect(buckets.map((bucket) => bucket.key)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });
});

describe('windowStart', () => {
  it('reaches back to the first day of the window', () => {
    const start = new Date(windowStart(14, new Date('2026-10-06T12:00:00.000Z')));
    expect(start.toISOString()).toBe('2026-09-23T12:00:00.000Z');
  });
});

describe('plotPoints', () => {
  it('pins the baseline to zero so small differences are not exaggerated', () => {
    const points = plotPoints([0, 5, 10], 100, 50, 0);
    expect(points[0]).toEqual({ x: 0, y: 50 });
    expect(points[1]).toEqual({ x: 50, y: 25 });
    expect(points[2]).toEqual({ x: 100, y: 0 });
  });

  it('draws an all-zero series flat along the baseline instead of dividing by zero', () => {
    const points = plotPoints([0, 0, 0], 90, 30, 0);
    expect(points.every((point) => point.y === 30)).toBe(true);
  });

  it('centres a single value and returns nothing for an empty series', () => {
    expect(plotPoints([4], 100, 40, 0)[0]?.x).toBe(50);
    expect(plotPoints([], 100, 40)).toEqual([]);
  });

  it('centres every value in its own band, so a point lines up with its label', () => {
    // Four days across 100px: bands of 25px, centred at 12.5, 37.5, 62.5 and 87.5.
    const points = plotPoints([1, 2, 3, 4], 100, 40, 0, 'band');
    expect(points.map((point) => point.x)).toEqual([12.5, 37.5, 62.5, 87.5]);
  });
});

describe('path building', () => {
  it('returns an empty path for an empty series', () => {
    expect(smoothLinePath([])).toBe('');
    expect(areaPath([], 10)).toBe('');
  });

  it('starts at the first point and ends at the last', () => {
    const path = smoothLinePath([
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ]);
    expect(path.startsWith('M 0 10')).toBe(true);
    expect(path.endsWith('10 0')).toBe(true);
  });

  it('closes the area back down to the baseline', () => {
    const path = areaPath(
      [
        { x: 0, y: 10 },
        { x: 10, y: 0 },
      ],
      40,
    );
    expect(path.endsWith('L 10 40 L 0 40 Z')).toBe(true);
  });
});

describe('donutSegments', () => {
  it('lays arcs end to end around the circle', () => {
    const segments = donutSegments(
      [
        { key: 'a', label: 'A', value: 3, color: 'red' },
        { key: 'b', label: 'B', value: 1, color: 'blue' },
      ],
      100,
    );

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ share: 0.75, dashArray: '75 25', dashOffset: -0 });
    expect(segments[1]).toMatchObject({ share: 0.25, dashArray: '25 75', dashOffset: -75 });
  });

  it('drops empty slices and returns nothing when the total is zero', () => {
    expect(
      donutSegments(
        [
          { key: 'a', label: 'A', value: 0, color: 'red' },
          { key: 'b', label: 'B', value: 2, color: 'blue' },
        ],
        100,
      ).map((segment) => segment.key),
    ).toEqual(['b']);

    expect(donutSegments([{ key: 'a', label: 'A', value: 0, color: 'red' }], 100)).toEqual([]);
  });
});

describe('share', () => {
  it('stays inside 0 and 1, whatever it is handed', () => {
    expect(share(5, 10)).toBe(0.5);
    expect(share(15, 10)).toBe(1);
    expect(share(-5, 10)).toBe(0);
    expect(share(5, 0)).toBe(0);
    expect(share(Number.NaN, 10)).toBe(0);
  });
});

describe('compactMoneyMinor', () => {
  it('divides minor units at the moment of display and never before', () => {
    expect(compactMoneyMinor(450_000)).toContain('4.5');
  });

  it('shows a dash rather than a zero for a missing figure', () => {
    expect(compactMoneyMinor(null)).toBe('—');
    expect(compactMoneyMinor(undefined)).toBe('—');
  });

  it('falls back to a plain amount for an unknown currency code', () => {
    expect(compactMoneyMinor(123_400, 'NOTACURRENCY')).toBe('NOTACURRENCY 1234');
  });
});

describe('greeting', () => {
  it('follows the reader clock', () => {
    expect(greeting(new Date(2026, 9, 6, 8))).toBe('Good morning');
    expect(greeting(new Date(2026, 9, 6, 13))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 9, 6, 20))).toBe('Good evening');
  });
});
