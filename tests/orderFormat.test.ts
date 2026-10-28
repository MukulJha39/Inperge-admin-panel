import type { OrderStatus } from '../src/api/types';
import {
  customerLabel,
  discountLabel,
  installmentStatusLabel,
  installmentTone,
  lineTypeLabel,
  ORDER_STATUS_FILTER_OPTIONS,
  orderStatusLabel,
  orderStatusTone,
  WALK_IN_LABEL,
} from '../src/utils/orderFormat';

/**
 * The order vocabulary the panel shows.
 *
 * These are the words an administrator reads, so they are tested rather than assumed:
 * a status that renders as `in_progress` is a leak of the data model into the interface.
 */

const ALL_STATUSES: OrderStatus[] = [
  'draft',
  'confirmed',
  'in_progress',
  'ready',
  'completed',
  'cancelled',
  'returned',
];

describe('order status labels', () => {
  it('gives every status a human label with no underscores', () => {
    for (const status of ALL_STATUSES) {
      const label = orderStatusLabel(status);
      expect(label).not.toContain('_');
      expect(label[0]).toBe(label[0]!.toUpperCase());
    }
  });

  it('reads in_progress as words rather than a field name', () => {
    expect(orderStatusLabel('in_progress')).toBe('In progress');
  });

  it('falls back readably for a status it has never seen', () => {
    expect(orderStatusLabel('awaiting_pickup')).toBe('awaiting pickup');
  });

  it('marks the outcomes an administrator should notice', () => {
    expect(orderStatusTone('completed')).toBe('success');
    expect(orderStatusTone('cancelled')).toBe('danger');
    expect(orderStatusTone('returned')).toBe('warning');
    // A draft is neutral, because nothing has been committed.
    expect(orderStatusTone('draft')).toBe('neutral');
  });

  it('offers every status as a filter, plus "any"', () => {
    expect(ORDER_STATUS_FILTER_OPTIONS[0]).toEqual({ value: '', label: 'Any status' });
    expect(ORDER_STATUS_FILTER_OPTIONS).toHaveLength(ALL_STATUSES.length + 1);
    for (const status of ALL_STATUSES) {
      expect(ORDER_STATUS_FILTER_OPTIONS.some((option) => option.value === status)).toBe(true);
    }
  });
});

describe('instalment labels', () => {
  it('names each stored state', () => {
    expect(installmentStatusLabel('pending')).toBe('Pending');
    expect(installmentStatusLabel('partially_paid')).toBe('Part paid');
    expect(installmentStatusLabel('paid')).toBe('Paid');
  });

  it('reads a late instalment as danger whatever its stored status says', () => {
    expect(installmentTone('pending', true)).toBe('danger');
    expect(installmentTone('partially_paid', true)).toBe('danger');
  });

  it('never reads a paid instalment as late', () => {
    // A paid instalment past its date is history, not a problem.
    expect(installmentTone('paid', true)).toBe('success');
  });

  it('distinguishes part paid from untouched', () => {
    expect(installmentTone('partially_paid', false)).toBe('warning');
    expect(installmentTone('pending', false)).toBe('neutral');
  });
});

describe('line and discount labels', () => {
  it('says what a line sold in words', () => {
    expect(lineTypeLabel('item')).toBe('Product');
    expect(lineTypeLabel('service')).toBe('Service');
  });

  it('carries the percentage into the discount row, so a total can be checked by hand', () => {
    expect(discountLabel('percent', 10)).toBe('Discount (10%)');
    expect(discountLabel('amount', null)).toBe('Discount');
    expect(discountLabel('none', null)).toBeNull();
  });

  it('shows a percentage discount with no rate as zero rather than blank', () => {
    expect(discountLabel('percent', null)).toBe('Discount (0%)');
  });
});

describe('customer labels', () => {
  it('names an anonymous sale rather than leaving a blank', () => {
    expect(customerLabel(null)).toBe(WALK_IN_LABEL);
    expect(customerLabel(null)).toBe('Walk-in sale');
  });

  it('uses the name recorded on the order when there is one', () => {
    expect(customerLabel('Kavita Joshi')).toBe('Kavita Joshi');
  });
});
