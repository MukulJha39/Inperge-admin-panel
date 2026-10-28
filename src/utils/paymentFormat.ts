import type { PaymentMethod, PaymentState } from '../api/types';

/**
 * Labels and tones for the Phase 3 money vocabulary.
 *
 * Kept with the other formatters so the admin panel and the merchant app describe the
 * same state with the same words.
 */

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
  other: 'Other',
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method.replace(/_/g, ' ');
}

export const PAYMENT_METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  unpaid: 'Unpaid',
  partially_paid: 'Part paid',
  fully_paid: 'Paid',
  overdue: 'Overdue',
};

export function paymentStateLabel(state: PaymentState): string {
  return PAYMENT_STATE_LABELS[state] ?? state;
}

/** Overdue is the one that should catch an administrator's eye, so it reads as danger. */
export function paymentStateTone(
  state: PaymentState,
): 'neutral' | 'success' | 'warning' | 'danger' {
  switch (state) {
    case 'fully_paid':
      return 'success';
    case 'partially_paid':
      return 'warning';
    case 'overdue':
      return 'danger';
    default:
      return 'neutral';
  }
}

export const PAYMENT_STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Any payment state' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partially_paid', label: 'Part paid' },
  { value: 'fully_paid', label: 'Paid' },
];

const CONTACT_CHANNEL_LABELS: Record<string, string> = {
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  both: 'SMS and WhatsApp',
  none: 'No preference',
};

export function contactChannelLabel(channel: string): string {
  return CONTACT_CHANNEL_LABELS[channel] ?? channel;
}

export const CONTACT_CHANNEL_OPTIONS = Object.entries(CONTACT_CHANNEL_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export const CONTACT_LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी' },
];

/** Parses a major-unit amount into whole minor units, or null when unusable. */
export function parseAmountToMinor(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  // Rounded to the nearest minor unit, so a typed third decimal cannot vanish silently.
  return Math.round(parsed * 100);
}

/** Renders whole minor units back into an editable major-unit string. */
export function minorToAmountInput(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '';
  return (minor / 100).toFixed(2);
}

export type { PaymentMethod };
