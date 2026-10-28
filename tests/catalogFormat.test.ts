import {
  billingUnitLabel,
  formatDelta,
  formatDate,
  formatDateTime,
  formatMoneyMinor,
  formatQuantity,
  movementTypeLabel,
  STOCK_REASON_OPTIONS,
  stockReasonLabel,
  registerUnits,
  unitLabel,
  unitOptions,
} from '../src/utils/format';
import { inputToMinor, minorToInput } from '../src/pages/CatalogDrawers';

describe('money display', () => {
  it('renders whole minor units as a currency amount', () => {
    // Non-breaking spaces vary by runtime, so the digits are what matter.
    expect(formatMoneyMinor(4500)).toMatch(/45\.00/);
    expect(formatMoneyMinor(0)).toMatch(/0\.00/);
    expect(formatMoneyMinor(4505)).toMatch(/45\.05/);
  });

  it('shows a dash rather than a zero for a missing amount', () => {
    expect(formatMoneyMinor(null)).toBe('—');
    expect(formatMoneyMinor(undefined)).toBe('—');
  });

  it('still shows the amount for an unfamiliar currency code', () => {
    expect(formatMoneyMinor(4500, 'ZZZ')).toMatch(/ZZZ\s?45\.00/);
  });
});

describe('date and time display', () => {
  it('formats timestamps as 12-hour time followed by day, month and year', () => {
    const date = new Date(2026, 9, 27, 15, 8);
    expect(formatDateTime(date.toISOString())).toBe('03:08 PM 27/10/2026');
  });

  it('formats date-only values as day, month and year', () => {
    expect(formatDate('2026-03-05')).toBe('05/03/2026');
  });
});

describe('money input conversion', () => {
  it('round-trips an amount through the input and back', () => {
    expect(minorToInput(4500)).toBe('45.00');
    expect(inputToMinor('45.00')).toBe(4500);
    expect(inputToMinor(minorToInput(123456) ?? '')).toBe(123456);
  });

  it('treats an empty input as no value, not as zero', () => {
    expect(minorToInput(null)).toBe('');
    expect(inputToMinor('')).toBeNull();
    expect(inputToMinor('   ')).toBeNull();
  });

  it('rounds to the nearest minor unit rather than truncating', () => {
    expect(inputToMinor('45.004')).toBe(4500);
    expect(inputToMinor('45.005')).toBe(4501);
    expect(inputToMinor('0.1')).toBe(10);
  });

  it('reports a bad amount instead of guessing', () => {
    expect(Number.isNaN(inputToMinor('abc') as number)).toBe(true);
    expect(Number.isNaN(inputToMinor('-5') as number)).toBe(true);
  });

  it('does not drift on values that trouble floating point', () => {
    for (const [text, expected] of [
      ['1.15', 115],
      ['2.675', 268],
      ['0.07', 7],
      ['1234.56', 123456],
    ] as const) {
      expect(inputToMinor(text)).toBe(expected);
    }
  });
});

describe('quantity and unit display', () => {
  it('pairs a quantity with a readable unit', () => {
    expect(formatQuantity(12, 'piece')).toBe('12 pieces');
    expect(formatQuantity(2.5, 'kilogram')).toBe('2.5 kg');
    expect(formatQuantity(5)).toBe('5');
  });

  it('falls back to the raw unit when it has no label', () => {
    expect(unitLabel('kilogram')).toBe('kg');
    expect(unitLabel('square_foot')).toBe('sq ft');
    expect(unitLabel('furlong')).toBe('furlong');
  });

  it('makes the direction of a change unmistakable', () => {
    expect(formatDelta(5, 'piece')).toBe('+5 pieces');
    expect(formatDelta(-3, 'piece')).toBe('-3 pieces');
    expect(formatDelta(0)).toBe('0');
  });
});

describe('catalog vocabulary labels', () => {
  it('labels billing units in plain language', () => {
    expect(billingUnitLabel('one_time')).toBe('One-time');
    expect(billingUnitLabel('per_session')).toBe('Per session');
    expect(billingUnitLabel('fortnightly')).toBe('fortnightly');
  });

  it('labels stock reasons and movement types', () => {
    expect(stockReasonLabel('manual_correction')).toBe('Manual correction');
    expect(stockReasonLabel(null)).toBe('—');
    expect(movementTypeLabel('opening')).toBe('Opening');
    expect(movementTypeLabel('sale')).toBe('Sold');
  });

  it('never offers opening stock as a reason an admin can pick', () => {
    const values = STOCK_REASON_OPTIONS.map((option) => option.value);

    // Opening stock is recorded when a record is created, never chosen by hand.
    expect(values).not.toContain('opening_stock');
    expect(values).toContain('damaged');
    expect(values).toContain('recount');
  });
});

describe('admin-managed units', () => {
  const units = [
    { value: 'piece', name: 'Piece', symbol: 'pieces', wholeNumbersOnly: true, appliesTo: ['item', 'material'] as Array<'item' | 'material'>, isActive: true },
    { value: 'tray', name: 'Tray', symbol: 'trays', wholeNumbersOnly: true, appliesTo: ['material'] as Array<'item' | 'material'>, isActive: true },
    { value: 'dozen', name: 'Dozen', symbol: 'dz', wholeNumbersOnly: true, appliesTo: ['item', 'material'] as Array<'item' | 'material'>, isActive: false },
  ];

  afterEach(() => registerUnits([]));

  it('labels quantities with the label an admin chose', () => {
    expect(unitLabel('tray')).toBe('tray');
    registerUnits(units);
    expect(unitLabel('tray')).toBe('trays');
    expect(formatQuantity(3, 'dozen')).toBe('3 dz');
  });

  it('offers active units for the kind, plus the current one even if inactive', () => {
    expect(unitOptions(units, 'item').map((option) => option.value)).toEqual(['piece']);
    expect(unitOptions(units, 'material').map((option) => option.value)).toEqual(['piece', 'tray']);
    const withCurrent = unitOptions(units, 'item', 'dozen');
    expect(withCurrent.map((option) => option.value)).toEqual(['piece', 'dozen']);
    expect(withCurrent[1]?.label).toContain('inactive');
  });

  it('keeps icon names out of plain picker labels', () => {
    const [option] = unitOptions([{ ...units[0]!, icon: 'category' }], 'item');
    expect(option?.label).toBe('Piece (pieces)');
  });
});
