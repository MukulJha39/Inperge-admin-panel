/**
 * Amounts are never shown in the admin panel.
 *
 * Every money figure — prices, payments, instalments, balances, dashboard totals — is
 * displayed as ₹ XxXx, and there is no setting to reveal it. Forms never put a stored
 * amount into an input either: an amount field starts empty and keeps the current value
 * unless the administrator types a new one. Excel exports from the panel are masked by
 * the API in the same way.
 */

export const MASKED_AMOUNT = '₹ XxXx';

/** Placeholder for an amount input whose stored value is kept but not shown. */
export const KEEP_AMOUNT_PLACEHOLDER = '₹ XxXx — type a new amount to change it';

/**
 * Amounts written into server text — "INR 40.00", "₹1,250.00", "Rs. 500" — as they appear
 * in error messages and audit summaries. Replaced so a sentence never gives a figure away.
 */
const AMOUNT_IN_TEXT = /(?:INR|Rs\.?|₹)\s?-?\d[\d,]*(?:\.\d+)?/gi;

export function maskAmountsInText(text: string): string {
  return text.replace(AMOUNT_IN_TEXT, MASKED_AMOUNT);
}

/** Whether an audit change records money, judged by its field name (paidMinor, sellingPriceMinor, …). */
export function isMoneyField(field: string): boolean {
  return /Minor$/.test(field);
}
