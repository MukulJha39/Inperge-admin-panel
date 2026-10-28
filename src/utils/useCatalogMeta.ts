import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { registerUnits, type UnitDescriptor } from './format';

export interface CatalogMeta {
  /** Admin-managed units, including inactive ones so existing records still read well. */
  units: UnitDescriptor[];
  /** Picker sections in display order, with the headings the merchant app shows. */
  unitGroups: Array<{ value: string; label: string }>;
  billingUnits: Array<{ value: string; supportsDuration: boolean }>;
  stockAdjustmentReasons: string[];
  businessCategories: string[];
  currencies: string[];
}

const EMPTY: CatalogMeta = {
  units: [],
  unitGroups: [],
  billingUnits: [],
  stockAdjustmentReasons: [],
  businessCategories: [],
  currencies: [],
};

let cached: CatalogMeta | null = null;
let inflight: Promise<CatalogMeta> | null = null;
const listeners = new Set<(meta: CatalogMeta) => void>();

function store(meta: CatalogMeta): void {
  cached = meta;
  registerUnits(meta.units ?? []);
  for (const listener of listeners) listener(meta);
}

function load(): Promise<CatalogMeta> {
  if (!inflight) {
    inflight = api
      .get<CatalogMeta>('/admin/catalog/meta')
      .then((result) => {
        store(result);
        return result;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Re-reads the vocabulary after an admin changes it (the Units screen), so pickers and
 * labels across the panel pick up the change without a reload.
 */
export async function refreshCatalogMeta(): Promise<void> {
  try {
    await load();
  } catch {
    // The next screen that needs it will try again.
  }
}

/**
 * The catalog vocabulary, fetched from the API rather than hard-coded here.
 *
 * Cached for the session and shared by every table and drawer. Units are editable in
 * the admin panel; `refreshCatalogMeta` updates every open screen when they change.
 */
export function useCatalogMeta(): { meta: CatalogMeta; loading: boolean } {
  const [meta, setMeta] = useState<CatalogMeta>(cached ?? EMPTY);
  const [loading, setLoading] = useState(cached === null);

  useEffect(() => {
    let active = true;
    const listener = (next: CatalogMeta) => {
      if (!active) return;
      setMeta(next);
      setLoading(false);
    };
    listeners.add(listener);

    if (!cached) {
      load().catch(() => {
        // A missing vocabulary should not break a screen; selects simply stay empty
        // and the server remains the thing that validates.
        if (active) setLoading(false);
      });
    }

    return () => {
      active = false;
      listeners.delete(listener);
    };
  }, []);

  return { meta, loading };
}

/** Test seam, so a suite can start from a clean cache. */
export function resetCatalogMetaCache(): void {
  cached = null;
  inflight = null;
  registerUnits([]);
}
