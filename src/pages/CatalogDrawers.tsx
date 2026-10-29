/**
 * Input helpers shared by the catalog forms (see `CatalogForms.tsx`): money is typed in
 * rupees and stored in paise, and quantities allow at most three decimal places.
 */

/* ------------------------------- money inputs ------------------------------ */

/**
 * Money is stored in whole minor units, so the input shows major units and converts
 * once, on submit. Nothing keeps a partially converted value around.
 */
export function minorToInput(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '';
  return (minor / 100).toFixed(2);
}

export function inputToMinor(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  const parsed = Number(trimmed);
  if (Number.isNaN(parsed) || parsed < 0) return Number.NaN;
  // Rounded to the nearest minor unit, so a typed third decimal cannot silently vanish.
  return Math.round(parsed * 100);
}

export function moneyError(text: string, { required = false } = {}): string | undefined {
  const value = inputToMinor(text);
  if (value === null) return required ? 'Enter an amount.' : undefined;
  if (Number.isNaN(value)) return 'Enter an amount of zero or more.';
  return undefined;
}

export function quantityError(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;

  const parsed = Number(trimmed);
  if (Number.isNaN(parsed) || parsed < 0) return 'Enter a quantity of zero or more.';
  if (Math.abs(parsed * 1000 - Math.round(parsed * 1000)) > 1e-6) {
    return 'Use at most three decimal places.';
  }
  return undefined;
}

export function nameError(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return 'Enter a name.';
  if (trimmed.length > 120) return 'Use 120 characters or fewer.';
  return undefined;
}
