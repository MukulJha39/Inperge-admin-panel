import type { InstallmentStatus, OrderStatus } from '../api/types';

/**
 * Labels and tones for the Phase 4 order vocabulary.
 *
 * Kept with the other formatters so the admin panel and the merchant app describe the
 * same state with the same words. The lifecycle itself is not duplicated here — the
 * server sends `allowedTransitions` with every order, and a second copy of the map is a
 * copy that can disagree.
 */

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  in_progress: 'In progress',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status as OrderStatus] ?? status.replace(/_/g, ' ');
}

/**
 * How a status reads at a glance.
 *
 * A draft is neutral because nothing is committed; the working statuses are informational;
 * completed is the good outcome; cancelled and returned are the ones an administrator
 * should notice without having to read the word.
 */
export function orderStatusTone(
  status: OrderStatus,
): 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'draft':
      return 'neutral';
    case 'confirmed':
      return 'brand';
    case 'in_progress':
    case 'ready':
      return 'info';
    case 'completed':
      return 'success';
    case 'returned':
      return 'warning';
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

export const ORDER_STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Any status' },
  ...(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((value) => ({
    value,
    label: ORDER_STATUS_LABELS[value],
  })),
];

const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  pending: 'Pending',
  partially_paid: 'Part paid',
  paid: 'Paid',
};

export function installmentStatusLabel(status: string): string {
  return INSTALLMENT_STATUS_LABELS[status as InstallmentStatus] ?? status;
}

/** A late instalment reads as danger whatever its stored status says. */
export function installmentTone(
  status: InstallmentStatus,
  isOverdue: boolean,
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'paid') return 'success';
  if (isOverdue) return 'danger';
  return status === 'partially_paid' ? 'warning' : 'neutral';
}

/** What a merchant sold on this line, in words rather than a type name. */
export function lineTypeLabel(lineType: string): string {
  return lineType === 'service' ? 'Service' : 'Product';
}

/**
 * Describes a discount the way it was entered.
 *
 * Both kinds are stored as a resolved amount as well, so this is a label rather than a
 * calculation — the amount shown beside it comes from the server.
 */
export function discountLabel(
  discountType: string,
  discountPercent: number | null,
): string | null {
  if (discountType === 'percent') return `Discount (${discountPercent ?? 0}%)`;
  if (discountType === 'amount') return 'Discount';
  return null;
}

/** The name to show for an order with no customer, rather than an empty cell. */
export const WALK_IN_LABEL = 'Walk-in sale';

export function customerLabel(customerName: string | null): string {
  return customerName ?? WALK_IN_LABEL;
}

/** A 24-hour `HH:mm` delivery time as it reads in the panel, for example "6:30 PM". */
export function formatDeliveryTime(time: string | null | undefined): string {
  const match = time ? /^(\d{2}):(\d{2})$/.exec(time) : null;
  if (!match) return '—';
  const hours = Number(match[1]);
  const suffix = hours < 12 ? 'AM' : 'PM';
  return `${hours % 12 || 12}:${match[2]} ${suffix}`;
}

/** Whether any of an order's delivery details are set. */
export function hasDelivery(order: {
  deliveryDate?: string | null;
  deliveryTime?: string | null;
  deliveryLocation?: string | null;
}): boolean {
  return Boolean(order.deliveryDate || order.deliveryTime || order.deliveryLocation);
}
