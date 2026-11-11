import { useSyncExternalStore } from 'react';

/**
 * "Hide amounts": masks every money figure in the panel as ₹ XxXx, for when the screen
 * is visible to someone who should not see prices or balances — in a meeting, on a
 * shared screen, or over a shoulder.
 *
 * Only what is displayed is masked. The figures themselves, the forms that edit them and
 * Excel exports are unchanged. The choice is remembered in this browser.
 */

export const MASKED_AMOUNT = '₹ XxXx';
const STORAGE_KEY = 'inperge.admin.hideAmounts';

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

let hidden = readStored();
const listeners = new Set<() => void>();

/** Read by the money formatters on every call, so a toggle reaches every figure. */
export function amountsHidden(): boolean {
  return hidden;
}

export function setAmountsHidden(next: boolean): void {
  hidden = next;
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // Private mode: the choice simply lasts for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether amounts are hidden, re-rendering the caller when it changes. */
export function useAmountsHidden(): boolean {
  return useSyncExternalStore(subscribe, amountsHidden, amountsHidden);
}
