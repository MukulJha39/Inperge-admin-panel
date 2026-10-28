import type { Gender } from '../api/types';

const GENDER_LABELS: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
};

export function genderLabel(gender: Gender | string): string {
  return GENDER_LABELS[gender as Gender] ?? gender;
}

export const GENDER_OPTIONS = (Object.keys(GENDER_LABELS) as Gender[]).map((value) => ({
  value,
  label: GENDER_LABELS[value],
}));

/** Country code and number stay separate in storage, and are joined only for display. */
export function formatPhone(countryCode: string, phone: string): string {
  return `${countryCode} ${phone}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const hour = date.getHours() % 12 || 12;
  const period = date.getHours() < 12 ? 'AM' : 'PM';
  return `${pad2(hour)}:${pad2(date.getMinutes())} ${period} ${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Never';

  const elapsed = Date.now() - date.getTime();
  if (elapsed < MINUTE) return 'Just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (elapsed < 7 * DAY) {
    const days = Math.floor(elapsed / DAY);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  return formatDate(iso);
}

/**
 * Turns an audit action key into a readable line, for example
 * `merchant.status_changed` becomes "Merchant status changed".
 */
export function formatAuditAction(action: string): string {
  const readable = action.replace(/[._]/g, ' ').trim();
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'empty';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

/* ------------------------------ Phase 2: catalog ----------------------------- */

/**
 * Money arrives as whole minor units, so it is divided only at the moment of display.
 * Nothing in the panel does arithmetic on a major-unit float.
 */
export function formatMoneyMinor(minor: number | null | undefined, currency = 'INR'): string {
  if (minor === null || minor === undefined) return '—';

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    // An unknown currency code should not break a table.
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

/**
 * Units are managed in the admin panel, so their labels come from the API. These
 * fallbacks cover the moment before the catalog vocabulary has loaded.
 */
const UNIT_LABELS: Record<string, string> = {
  piece: 'pieces',
  pack: 'packs',
  box: 'boxes',
  set: 'sets',
  pair: 'pairs',
  dozen: 'dozen',
  bag: 'bags',
  bottle: 'bottles',
  roll: 'rolls',
  sheet: 'sheets',
  gram: 'g',
  kilogram: 'kg',
  millilitre: 'ml',
  litre: 'L',
  centimetre: 'cm',
  metre: 'm',
  foot: 'ft',
  square_foot: 'sq ft',
};

export interface UnitDescriptor {
  value: string;
  name: string;
  symbol: string;
  /** Optional Material Icons name; older API responses may leave it out. */
  icon?: string | null;
  group?: 'weight' | 'volume' | 'count' | 'length' | 'other';
  wholeNumbersOnly: boolean;
  appliesTo: Array<'item' | 'material'>;
  isActive: boolean;
}

let registeredUnits = new Map<string, UnitDescriptor>();

/** Called when the catalog vocabulary loads, so every label follows the admin's edits. */
export function registerUnits(units: UnitDescriptor[]): void {
  registeredUnits = new Map(units.map((unit) => [unit.value, unit]));
}

/** The label shown after a quantity, for example "kg" or "pieces". */
export function unitLabel(unit: string): string {
  return registeredUnits.get(unit)?.symbol ?? UNIT_LABELS[unit] ?? unit.replace(/_/g, ' ');
}

/**
 * Options for a unit picker: active units meant for this kind of record, plus the
 * record's current unit even if it has since been deactivated, so it never silently
 * changes on save.
 */
export function unitOptions(
  units: UnitDescriptor[],
  kind: 'item' | 'material',
  current?: string,
): Array<{ value: string; label: string }> {
  const options = units
    .filter((unit) => (unit.isActive && unit.appliesTo.includes(kind)) || unit.value === current)
    .map((unit) => ({
      value: unit.value,
      label: `${unit.name} (${unit.symbol})${unit.isActive ? '' : ' — inactive'}`,
    }));
  if (current && !options.some((option) => option.value === current)) {
    options.unshift({ value: current, label: unitLabel(current) });
  }
  return options;
}

export function formatQuantity(quantity: number, unit?: string): string {
  const rendered = Number.isInteger(quantity) ? String(quantity) : String(quantity);
  return unit ? `${rendered} ${unitLabel(unit)}` : rendered;
}

const BILLING_UNIT_LABELS: Record<string, string> = {
  one_time: 'One-time',
  hourly: 'Per hour',
  per_session: 'Per session',
  per_unit: 'Per unit',
  package: 'Package',
};

export function billingUnitLabel(billingUnit: string): string {
  return BILLING_UNIT_LABELS[billingUnit] ?? billingUnit.replace(/_/g, ' ');
}

const REASON_LABELS: Record<string, string> = {
  opening_stock: 'Opening stock',
  damaged: 'Damaged',
  lost: 'Lost',
  expired: 'Expired',
  found: 'Found',
  manual_correction: 'Manual correction',
  recount: 'Recount',
  other: 'Other',
};

export function stockReasonLabel(reason: string | null): string {
  if (!reason) return '—';
  return REASON_LABELS[reason] ?? reason.replace(/_/g, ' ');
}

export const STOCK_REASON_OPTIONS = Object.entries(REASON_LABELS)
  // Opening stock is recorded by the system when a record is created, never chosen here.
  .filter(([value]) => value !== 'opening_stock')
  .map(([value, label]) => ({ value, label }));

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  opening: 'Opening',
  adjustment: 'Adjustment',
  receipt: 'Received',
  sale: 'Sold',
  return: 'Returned',
  reversal: 'Reversed',
};

export function movementTypeLabel(type: string): string {
  return MOVEMENT_TYPE_LABELS[type] ?? type;
}

/** A signed change, written so the direction is unmistakable. */
export function formatDelta(delta: number, unit?: string): string {
  const sign = delta > 0 ? '+' : '';
  return `${sign}${formatQuantity(delta, unit)}`;
}

export function businessCategoryLabel(category: string | null): string {
  if (!category) return '—';
  return category
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
